import { TokenBucketLimiter } from "@nujum/shared";
import { getEnv } from "../env";

export class SecurityError extends Error {
  constructor(
    message: string,
    readonly code:
      "BAD_REQUEST" | "ORIGIN" | "RATE_LIMITED" | "REAUTH" | "FORBIDDEN" | "INTERNAL" = "FORBIDDEN",
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Pure helper so CSRF origin checks can be unit-tested. */
export function isAllowedOrigin(origin: string | null, allowed: readonly string[]): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin).origin;
    return allowed.includes(parsed);
  } catch {
    return false;
  }
}

export async function assertSameOrigin(): Promise<void> {
  const env = getEnv();
  const allowed = [env.NEXT_PUBLIC_APP_URL, ...(env.AUTH_URL ? [env.AUTH_URL] : [])].map(
    (value) => new URL(value).origin,
  );
  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  if (!isAllowedOrigin(requestHeaders.get("origin"), allowed)) {
    throw new SecurityError("Request origin was rejected.", "ORIGIN");
  }
}

const limiters = new Map<string, TokenBucketLimiter>();

/** Per-instance defense in depth; server-side authorization is always rechecked. */
export function assertRateLimit(key: string): void {
  const env = getEnv();
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new TokenBucketLimiter({
      capacity: env.DASHBOARD_RATE_LIMIT,
      refillPerSecond: env.DASHBOARD_RATE_LIMIT / 60,
    });
    limiters.set(key, limiter);
  }
  const result = limiter.consume(key, 1, Date.now());
  if (!result.allowed) throw new SecurityError("Too many requests. Slow down.", "RATE_LIMITED");
}

export function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof SecurityError) {
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" };
}

export function assertReauthenticated(reauthenticatedAt: Date): void {
  const env = getEnv();
  if (Date.now() - reauthenticatedAt.getTime() > env.REAUTH_WINDOW_MINUTES * 60_000) {
    throw new SecurityError("Please sign in again to confirm this change.", "REAUTH");
  }
}
