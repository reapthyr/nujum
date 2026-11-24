import { describe, expect, it } from "vitest";
import { dashboardEnvSchema, getEnv, resetEnvCache } from "./env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/nujum?schema=public",
  AUTH_SECRET: "a".repeat(48),
  AUTH_DISCORD_ID: "123456789012345678",
  AUTH_DISCORD_SECRET: "discord-secret",
  NEXT_PUBLIC_APP_URL: "https://dashboard.example.com",
  BOT_API_URL: "https://api.example.com/",
  BOT_API_HMAC_SECRET: "b".repeat(64),
};

describe("dashboard environment", () => {
  it("accepts a complete configuration and normalizes URLs", () => {
    const parsed = dashboardEnvSchema.parse(valid);
    expect(parsed.BOT_API_URL).toBe("https://api.example.com");
    expect(parsed.DASHBOARD_OWNER_IDS).toEqual([]);
    expect(parsed.SESSION_MAX_AGE_SECONDS).toBe(28_800);
  });

  it("parses owner ids and rejects malformed snowflakes", () => {
    const parsed = dashboardEnvSchema.parse({
      ...valid,
      DASHBOARD_OWNER_IDS: "123456789012345678, 987654321098765432",
    });
    expect(parsed.DASHBOARD_OWNER_IDS).toEqual(["123456789012345678", "987654321098765432"]);
    expect(() =>
      dashboardEnvSchema.parse({ ...valid, DASHBOARD_OWNER_IDS: "not-a-snowflake" }),
    ).toThrow();
  });

  it("names missing variables without printing values", () => {
    resetEnvCache();
    expect(() => getEnv({})).toThrow(/AUTH_SECRET/);
    expect(() => getEnv(valid)).not.toThrow();
  });

  it("fails when a secret is exposed to the client", () => {
    resetEnvCache();
    expect(() => getEnv({ ...valid, NEXT_PUBLIC_BOT_API_HMAC_SECRET: "b".repeat(64) })).toThrow(
      /NEXT_PUBLIC_/,
    );
  });
});
