import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HMAC_CONSTANTS } from "./constants";

/**
 * HMAC-SHA256 request signing for dashboard → bot API calls.
 *
 * canonical = `${timestamp}\n${nonce}\n${METHOD}\n${normalizedPath}\n${sha256hex(body)}`
 * signature = hex(HMAC_SHA256(secret, canonical))
 */

export type HmacHeaderBag = Record<string, string | string[] | undefined>;

export interface SignRequestInput {
  secret: string;
  method: string;
  path: string;
  body?: string | Buffer | null;
  timestamp?: number;
  nonce?: string;
  keyId?: string;
}

export interface SignedRequest {
  headers: Record<string, string>;
  canonical: string;
  signature: string;
  timestamp: number;
  nonce: string;
}

export type HmacFailureCode =
  | "MISSING_HEADERS"
  | "BAD_TIMESTAMP"
  | "EXPIRED"
  | "BAD_NONCE"
  | "BAD_KEY_ID"
  | "BAD_SIGNATURE"
  | "REPLAY";

export type HmacVerification =
  | { ok: true; keyId: string; timestamp: number }
  | { ok: false; code: HmacFailureCode; message: string };

export interface VerifyRequestInput {
  secret: string;
  /** Accepted during zero-downtime secret rotation. */
  previousSecret?: string | undefined;
  headers: HmacHeaderBag;
  method: string;
  path: string;
  body?: string | Buffer | null;
  now?: number;
  windowMs?: number;
  expectedKeyId?: string;
  nonceCache?: NonceCache;
}

export interface NonceCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
}

/** Bounded, lazy-pruned replay cache. */
export class NonceCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly seen = new Map<string, number>();

  constructor(options: NonceCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? HMAC_CONSTANTS.nonceTtlMs;
    this.maxEntries = options.maxEntries ?? HMAC_CONSTANTS.maxNonceEntries;
  }

  /** Returns false when the nonce was already used inside the TTL. */
  checkAndStore(nonce: string, now = Date.now()): boolean {
    this.prune(now);
    if (this.seen.has(nonce)) return false;
    if (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    this.seen.set(nonce, now + this.ttlMs);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  clear(): void {
    this.seen.clear();
  }

  private prune(now: number): void {
    for (const [nonce, expiresAt] of this.seen) {
      if (expiresAt > now) break;
      this.seen.delete(nonce);
    }
  }
}

export function sha256Hex(body: string | Buffer | null | undefined): string {
  const buffer = body === null || body === undefined ? Buffer.alloc(0) : Buffer.from(body);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Sorts query parameters so the dashboard and the bot sign the same string
 * regardless of parameter order. Fragments are never sent over the wire.
 */
export function normalizePath(path: string): string {
  const hashIndex = path.indexOf("#");
  const withoutFragment = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = withoutFragment.indexOf("?");
  if (queryIndex < 0) return withoutFragment;
  const pathname = withoutFragment.slice(0, queryIndex);
  const params = new URLSearchParams(withoutFragment.slice(queryIndex + 1));
  params.sort();
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function canonicalRequest(input: {
  method: string;
  path: string;
  timestamp: number;
  nonce: string;
  body?: string | Buffer | null;
}): string {
  return [
    String(input.timestamp),
    input.nonce,
    input.method.toUpperCase(),
    normalizePath(input.path),
    sha256Hex(input.body),
  ].join("\n");
}

export function computeSignature(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

function readHeader(headers: HmacHeaderBag, name: string): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) return direct[0];
  return direct;
}

function safeEqualHex(expected: string, provided: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function fail(code: HmacFailureCode, message: string): HmacVerification {
  return { ok: false, code, message };
}

export function signRequest(input: SignRequestInput): SignedRequest {
  if (input.secret.length < HMAC_CONSTANTS.secretMinLength) {
    throw new Error("HMAC secret is too short");
  }
  if (!input.path.startsWith("/")) throw new Error("Signed path must start with '/'");

  const timestamp = input.timestamp ?? Date.now();
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const keyId = input.keyId ?? HMAC_CONSTANTS.defaultKeyId;
  const canonical = canonicalRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  });
  const signature = computeSignature(input.secret, canonical);

  return {
    headers: {
      [HMAC_CONSTANTS.headerKeyId]: keyId,
      [HMAC_CONSTANTS.headerTimestamp]: String(timestamp),
      [HMAC_CONSTANTS.headerNonce]: nonce,
      [HMAC_CONSTANTS.headerSignature]: signature,
    },
    canonical,
    signature,
    timestamp,
    nonce,
  };
}

export function verifyRequest(input: VerifyRequestInput): HmacVerification {
  const keyId = readHeader(input.headers, HMAC_CONSTANTS.headerKeyId);
  const timestampHeader = readHeader(input.headers, HMAC_CONSTANTS.headerTimestamp);
  const nonce = readHeader(input.headers, HMAC_CONSTANTS.headerNonce);
  const signature = readHeader(input.headers, HMAC_CONSTANTS.headerSignature);

  if (!keyId || !timestampHeader || !nonce || !signature) {
    return fail("MISSING_HEADERS", "Missing authentication headers");
  }
  if (keyId !== (input.expectedKeyId ?? HMAC_CONSTANTS.defaultKeyId)) {
    return fail("BAD_KEY_ID", "Unknown API key id");
  }
  if (!/^\d{10,16}$/.test(timestampHeader)) {
    return fail("BAD_TIMESTAMP", "Malformed timestamp");
  }
  if (!/^[a-f0-9]{16,128}$/i.test(nonce)) {
    return fail("BAD_NONCE", "Malformed nonce");
  }

  const timestamp = Number(timestampHeader);
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? HMAC_CONSTANTS.windowMs;
  if (Math.abs(now - timestamp) > windowMs) {
    return fail("EXPIRED", "Request timestamp is outside the allowed window");
  }

  const canonical = canonicalRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    body: input.body,
  });

  const validWithCurrent = safeEqualHex(computeSignature(input.secret, canonical), signature);
  const validWithPrevious =
    !validWithCurrent && input.previousSecret
      ? safeEqualHex(computeSignature(input.previousSecret, canonical), signature)
      : false;

  if (!validWithCurrent && !validWithPrevious) {
    return fail("BAD_SIGNATURE", "Invalid request signature");
  }

  if (input.nonceCache && !input.nonceCache.checkAndStore(nonce, now)) {
    return fail("REPLAY", "Request nonce has already been used");
  }

  return { ok: true, keyId, timestamp };
}

export { readHeader };
