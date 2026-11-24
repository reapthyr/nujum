import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  assertNoPublicSecrets,
  botApiEnvSchema,
  databaseEnvSchema,
  parseEnv,
} from "./env";

const DATABASE_URL = "postgresql://nujum:secret@localhost:5432/nujum?schema=public";

describe("parseEnv", () => {
  it("returns typed values for a valid environment", () => {
    const env = parseEnv(databaseEnvSchema, { DATABASE_URL }, "shared");
    expect(env.DATABASE_URL).toBe(DATABASE_URL);
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it("names the missing variable without leaking values", () => {
    try {
      parseEnv(databaseEnvSchema, {}, "shared");
      expect.unreachable("expected parseEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as EnvValidationError).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("secret");
    }
  });

  it("rejects a non-postgres URL", () => {
    expect(() =>
      parseEnv(databaseEnvSchema, { DATABASE_URL: "mysql://localhost/db" }, "shared"),
    ).toThrow(EnvValidationError);
  });

  it("enforces the HMAC secret length and normalizes an empty rotation secret", () => {
    expect(() => parseEnv(botApiEnvSchema, { BOT_API_HMAC_SECRET: "too-short" }, "shared")).toThrow(
      EnvValidationError,
    );

    const env = parseEnv(
      botApiEnvSchema,
      { BOT_API_HMAC_SECRET: "x".repeat(64), BOT_API_HMAC_SECRET_PREVIOUS: "" },
      "shared",
    );
    expect(env.BOT_API_HMAC_SECRET_PREVIOUS).toBeUndefined();
  });
});

describe("assertNoPublicSecrets", () => {
  it("fails the build when a secret uses the NEXT_PUBLIC_ prefix", () => {
    expect(() => assertNoPublicSecrets({ NEXT_PUBLIC_BOT_TOKEN: "abc" })).toThrow(
      EnvValidationError,
    );
    expect(() => assertNoPublicSecrets({ NEXT_PUBLIC_DATABASE_URL: "postgres://x" })).toThrow();
  });

  it("allows harmless public values", () => {
    expect(() =>
      assertNoPublicSecrets({
        NEXT_PUBLIC_SITE_URL: "https://nujum.app",
        NEXT_PUBLIC_DISCORD_CLIENT_ID: "123",
      }),
    ).not.toThrow();
  });
});
