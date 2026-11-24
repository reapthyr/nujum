import { z } from "zod";
import { HMAC_CONSTANTS, LOCALES } from "./constants";

/**
 * Environment validation factories. Every deployable calls `parseEnv` at
 * startup with its own schema and crashes with a clear, value-free message.
 */

export type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly app: string;
  readonly issues: string[];

  constructor(app: string, issues: string[]) {
    super(`Invalid environment for ${app}:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.app = app;
    this.issues = issues;
  }
}

const postgresUrlSchema = z
  .string()
  .min(1, "is required")
  .refine(
    (value) => /^postgres(ql)?:\/\//.test(value),
    "must be a postgres:// or postgresql:// URL",
  );

export const databaseEnvSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  DIRECT_URL: postgresUrlSchema.optional(),
});

export const botApiSecretSchema = z
  .string()
  .min(
    HMAC_CONSTANTS.secretMinLength,
    `must be at least ${HMAC_CONSTANTS.secretMinLength} characters`,
  );

export const botApiEnvSchema = z.object({
  BOT_API_HMAC_SECRET: botApiSecretSchema,
  BOT_API_HMAC_SECRET_PREVIOUS: z
    .union([botApiSecretSchema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const localeEnvSchema = z.enum(LOCALES);

const SECRET_NAME_PATTERN = /(SECRET|TOKEN|PASSWORD|DATABASE_URL|DIRECT_URL|HMAC|API_KEY)/i;

/**
 * Fails the build when a secret is accidentally exposed with NEXT_PUBLIC_.
 * Called from the dashboard's server-only env module.
 */
export function assertNoPublicSecrets(env: EnvSource): void {
  const exposed = Object.keys(env).filter(
    (key) => key.startsWith("NEXT_PUBLIC_") && SECRET_NAME_PATTERN.test(key),
  );
  if (exposed.length > 0) {
    throw new EnvValidationError(
      "dashboard",
      exposed.map((key) => `${key}: secrets must never use the NEXT_PUBLIC_ prefix`),
    );
  }
}

export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: EnvSource,
  app: string,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    });
    throw new EnvValidationError(app, issues);
  }
  // Generic zod schemas surface `any` here; the caller's schema type is authoritative.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return result.data;
}

/** Reads a required string with a clear error instead of `undefined` propagation. */
export function requireEnv(source: EnvSource, key: string): string {
  const value = source[key];
  if (value === undefined || value.trim() === "") {
    throw new EnvValidationError("process", [`${key}: is required`]);
  }
  return value;
}

export function envFlag(source: EnvSource, key: string, defaultValue = false): boolean {
  const value = source[key];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isProduction(source: EnvSource = process.env): boolean {
  return source.NODE_ENV === "production";
}
