import { describe, expect, it } from "vitest";
import { EnvValidationError } from "@nujum/shared/env";
import { loadEnv } from "./env";

const BASE = {
  NODE_ENV: "test",
  LOG_LEVEL: "error",
  LOG_PRETTY: "false",
  DISCORD_TOKEN: "a".repeat(60),
  DISCORD_CLIENT_ID: "123456789012345678",
  DATABASE_URL: "postgresql://nujum:secret@localhost:5432/nujum?schema=public",
  BOT_API_HMAC_SECRET: "b".repeat(64),
};

describe("bot environment", () => {
  it("parses a minimal valid environment with defaults", () => {
    const env = loadEnv(BASE);
    expect(env.BOT_API_HOST).toBe("127.0.0.1");
    expect(env.BOT_API_PORT).toBe(8080);
    expect(env.SHARD_COUNT).toBe(1);
    expect(env.OWNER_IDS).toEqual([]);
    expect(env.BOT_API_IP_ALLOWLIST).toEqual([]);
    expect(env.BOT_API_TRUST_PROXY).toBe(false);
    expect(env.BOT_STATUS).toBe("online");
  });

  it("parses comma-separated owners, shards and CIDRs", () => {
    const env = loadEnv({
      ...BASE,
      OWNER_IDS: "123456789012345678, 987654321098765432",
      SHARD_IDS: "0, 1",
      SHARD_COUNT: "4",
      BOT_API_IP_ALLOWLIST: "10.0.0.0/8, 2001:db8::/32",
      BOT_API_TRUST_PROXY: "true",
    });
    expect(env.OWNER_IDS).toHaveLength(2);
    expect(env.SHARD_IDS).toEqual([0, 1]);
    expect(env.BOT_API_IP_ALLOWLIST).toEqual(["10.0.0.0/8", "2001:db8::/32"]);
    expect(env.BOT_API_TRUST_PROXY).toBe(true);
  });

  it("rejects a missing token with a value-free message", () => {
    try {
      loadEnv({ ...BASE, DISCORD_TOKEN: undefined });
      expect.unreachable("expected loadEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).message).toContain("DISCORD_TOKEN");
      expect((error as EnvValidationError).message).not.toContain("secret");
    }
  });

  it("rejects a weak HMAC secret", () => {
    expect(() => loadEnv({ ...BASE, BOT_API_HMAC_SECRET: "short" })).toThrow(EnvValidationError);
  });

  it("rejects malformed allowlist entries and shard ids", () => {
    expect(() => loadEnv({ ...BASE, BOT_API_IP_ALLOWLIST: "not-a-cidr" })).toThrow(
      EnvValidationError,
    );
    expect(() => loadEnv({ ...BASE, SHARD_COUNT: "2", SHARD_IDS: "5" })).toThrow(
      EnvValidationError,
    );
    expect(() => loadEnv({ ...BASE, BOT_API_PORT: "0" })).toThrow(EnvValidationError);
  });

  it("rejects a non-postgres database URL", () => {
    expect(() => loadEnv({ ...BASE, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      EnvValidationError,
    );
  });
});
