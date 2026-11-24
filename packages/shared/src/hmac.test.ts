import { describe, expect, it } from "vitest";
import {
  NonceCache,
  canonicalRequest,
  normalizePath,
  signRequest,
  verifyRequest,
  type HmacHeaderBag,
} from "./hmac";

const SECRET = "a".repeat(64);
const PREVIOUS = "b".repeat(64);
const PATH = "/v1/guilds/123456789012345678/channels?b=2&a=1";
const NORMALIZED = "/v1/guilds/123456789012345678/channels?a=1&b=2";
const BODY = JSON.stringify({ hello: "world" });

function headersOf(signed: ReturnType<typeof signRequest>): HmacHeaderBag {
  return { ...signed.headers };
}

describe("normalizePath", () => {
  it("sorts query parameters and strips fragments", () => {
    expect(normalizePath(`${PATH}#frag`)).toBe(NORMALIZED);
  });

  it("leaves paths without a query untouched", () => {
    expect(normalizePath("/healthz")).toBe("/healthz");
  });
});

describe("canonicalRequest", () => {
  it("hashes the body and includes every signed component", () => {
    const canonical = canonicalRequest({
      method: "post",
      path: PATH,
      timestamp: 1_700_000_000_000,
      nonce: "abc123",
      body: BODY,
    });
    const [timestamp, nonce, method, path] = canonical.split("\n");
    expect(timestamp).toBe("1700000000000");
    expect(nonce).toBe("abc123");
    expect(method).toBe("POST");
    expect(path).toBe(NORMALIZED);
    expect(canonical.split("\n")[4]).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("signRequest + verifyRequest", () => {
  it("accepts a valid signature regardless of query order", () => {
    const signed = signRequest({ secret: SECRET, method: "GET", path: PATH, body: BODY });
    const result = verifyRequest({
      secret: SECRET,
      headers: headersOf(signed),
      method: "GET",
      path: NORMALIZED,
      body: BODY,
      nonceCache: new NonceCache(),
    });
    expect(result).toEqual({ ok: true, keyId: "dashboard", timestamp: signed.timestamp });
  });

  it("rejects a tampered body", () => {
    const signed = signRequest({ secret: SECRET, method: "POST", path: PATH, body: BODY });
    const result = verifyRequest({
      secret: SECRET,
      headers: headersOf(signed),
      method: "POST",
      path: PATH,
      body: `${BODY} `,
    });
    expect(result).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
  });

  it("rejects a tampered method", () => {
    const signed = signRequest({ secret: SECRET, method: "POST", path: PATH, body: BODY });
    const result = verifyRequest({
      secret: SECRET,
      headers: headersOf(signed),
      method: "DELETE",
      path: PATH,
      body: BODY,
    });
    expect(result).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
  });

  it("rejects an expired timestamp", () => {
    const signed = signRequest({
      secret: SECRET,
      method: "GET",
      path: "/v1/meta",
      timestamp: Date.now() - 61_000,
    });
    const result = verifyRequest({
      secret: SECRET,
      headers: headersOf(signed),
      method: "GET",
      path: "/v1/meta",
    });
    expect(result).toMatchObject({ ok: false, code: "EXPIRED" });
  });

  it("rejects replayed nonces", () => {
    const nonceCache = new NonceCache();
    const signed = signRequest({ secret: SECRET, method: "GET", path: "/v1/meta" });
    const input = {
      secret: SECRET,
      headers: headersOf(signed),
      method: "GET",
      path: "/v1/meta",
      nonceCache,
    };
    expect(verifyRequest(input).ok).toBe(true);
    expect(verifyRequest(input)).toMatchObject({ ok: false, code: "REPLAY" });
  });

  it("rejects missing or malformed headers", () => {
    expect(
      verifyRequest({ secret: SECRET, headers: {}, method: "GET", path: "/v1/meta" }),
    ).toMatchObject({ ok: false, code: "MISSING_HEADERS" });

    const signed = signRequest({ secret: SECRET, method: "GET", path: "/v1/meta" });
    const malformed = { ...signed.headers, "x-nujum-timestamp": "not-a-number" };
    expect(
      verifyRequest({ secret: SECRET, headers: malformed, method: "GET", path: "/v1/meta" }),
    ).toMatchObject({ ok: false, code: "BAD_TIMESTAMP" });
  });

  it("rejects an unknown key id", () => {
    const signed = signRequest({
      secret: SECRET,
      method: "GET",
      path: "/v1/meta",
      keyId: "somebody-else",
    });
    expect(
      verifyRequest({
        secret: SECRET,
        headers: headersOf(signed),
        method: "GET",
        path: "/v1/meta",
      }),
    ).toMatchObject({ ok: false, code: "BAD_KEY_ID" });
  });

  it("accepts the previous secret during rotation", () => {
    const signed = signRequest({ secret: PREVIOUS, method: "GET", path: "/v1/meta" });
    const result = verifyRequest({
      secret: SECRET,
      previousSecret: PREVIOUS,
      headers: headersOf(signed),
      method: "GET",
      path: "/v1/meta",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses to sign with a weak secret", () => {
    expect(() => signRequest({ secret: "short", method: "GET", path: "/v1/meta" })).toThrow();
  });
});

describe("NonceCache", () => {
  it("expires nonces after the TTL", () => {
    const cache = new NonceCache({ ttlMs: 1_000 });
    expect(cache.checkAndStore("nonce", 0)).toBe(true);
    expect(cache.checkAndStore("nonce", 500)).toBe(false);
    expect(cache.checkAndStore("nonce", 2_000)).toBe(true);
  });

  it("bounds its size", () => {
    const cache = new NonceCache({ maxEntries: 2, ttlMs: 60_000 });
    cache.checkAndStore("a", 0);
    cache.checkAndStore("b", 0);
    cache.checkAndStore("c", 0);
    expect(cache.size).toBe(2);
  });
});
