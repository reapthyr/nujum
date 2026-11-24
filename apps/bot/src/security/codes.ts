import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Short-lived verification codes are stored as `salt:sha256(salt + code)`. */
export function hashVerificationCode(
  code: string,
  salt = randomInt(1, 0x7fffffff).toString(36),
): string {
  const digest = createHash("sha256").update(`${salt}:${code}`).digest("hex");
  return `${salt}:${digest}`;
}

export function verifyVerificationCode(code: string, stored: string): boolean {
  const separator = stored.indexOf(":");
  if (separator <= 0) return false;
  const salt = stored.slice(0, separator);
  const expected = stored.slice(separator + 1);
  const actual = createHash("sha256").update(`${salt}:${code}`).digest("hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

/** Generates a 6-digit numeric code (leading zeros allowed). */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
