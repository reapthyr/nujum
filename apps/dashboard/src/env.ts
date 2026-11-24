import { z } from "zod";
import { BRAND } from "@nujum/shared";
import {
  assertNoPublicSecrets,
  botApiSecretSchema,
  databaseEnvSchema,
  parseEnv,
  type EnvSource,
} from "@nujum/shared/env";

/**
 * Dashboard environment contract. Every secret is server-only; a missing or
 * malformed value fails startup with a value-free error.
 */
const snowflakeSchema = z.string().regex(/^\d{16,20}$/, "must be a Discord snowflake id");

function csvSnowflakes() {
  return z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(snowflakeSchema));
}

export const dashboardEnvSchema = databaseEnvSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  AUTH_DISCORD_ID: snowflakeSchema,
  AUTH_DISCORD_SECRET: z.string().min(10, "is required"),
  AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  BOT_API_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, "")),
  BOT_API_HMAC_SECRET: botApiSecretSchema,
  BOT_API_HMAC_SECRET_PREVIOUS: z
    .union([botApiSecretSchema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  DASHBOARD_OWNER_IDS: csvSnowflakes(),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
  SESSION_UPDATE_AGE_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  REAUTH_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  DASHBOARD_RATE_LIMIT: z.coerce.number().int().min(5).max(1_000).default(120),
});

export type DashboardEnv = z.infer<typeof dashboardEnvSchema>;

let cached: DashboardEnv | undefined;

/** Parsed lazily so tooling can import unrelated modules without credentials. */
export function getEnv(source: EnvSource = process.env): DashboardEnv {
  assertNoPublicSecrets(source);
  cached ??= parseEnv(dashboardEnvSchema, source, BRAND.name + " dashboard");
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
