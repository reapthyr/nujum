import { z } from "zod";
import { BRAND, PRESENCE_STATUSES } from "@nujum/shared";
import { botApiEnvSchema, databaseEnvSchema, parseEnv, type EnvSource } from "@nujum/shared/env";
import { isValidCidr } from "../lib/ip";

/**
 * Bot environment contract.
 *
 * Every value is validated at boot; a missing or malformed variable throws an
 * `EnvValidationError` that names the variable but never prints its value.
 */

const snowflakeSchema = z.string().regex(/^\d{16,20}$/, "must be a Discord snowflake id");

function flag(
  defaultValue: boolean,
): z.ZodEffects<z.ZodOptional<z.ZodString>, boolean, string | undefined> {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") return defaultValue;
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    });
}

function csvSnowflakes(): z.ZodPipeline<
  z.ZodEffects<z.ZodOptional<z.ZodString>, string[], string | undefined>,
  z.ZodArray<typeof snowflakeSchema>
> {
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

function csvIndices(): z.ZodPipeline<
  z.ZodEffects<z.ZodOptional<z.ZodString>, number[], string | undefined>,
  z.ZodArray<z.ZodNumber>
> {
  return z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => Number.parseInt(entry, 10))
        : [],
    )
    .pipe(z.array(z.number().int().min(0).max(1_000)));
}

export const botEnvSchema = databaseEnvSchema
  .extend({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    LOG_PRETTY: z.enum(["true", "false"]).optional(),

    DISCORD_TOKEN: z
      .string()
      .min(50, "must be a bot token from the Discord developer portal")
      .regex(/^[A-Za-z0-9._-]+$/, "contains characters that do not belong in a bot token"),
    DISCORD_CLIENT_ID: snowflakeSchema,
    DEV_GUILD_ID: snowflakeSchema.optional(),
    OWNER_IDS: csvSnowflakes(),

    BOT_API_HOST: z.string().min(1).max(255).default("127.0.0.1"),
    BOT_API_PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    BOT_API_TRUST_PROXY: flag(false),
    BOT_API_IP_ALLOWLIST: z
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
      .pipe(
        z
          .array(z.string())
          .refine(
            (entries) => entries.every(isValidCidr),
            "must be comma-separated CIDRs (e.g. 10.0.0.0/8)",
          ),
      ),

    SHARD_COUNT: z.coerce.number().int().min(1).max(100).default(1),
    SHARD_IDS: csvIndices(),

    BOT_STATUS: z.enum(PRESENCE_STATUSES).default("online"),
    BOT_ACTIVITY: z.string().min(1).max(128).default(`${BRAND.name} • /help`),
    SUPPORT_SERVER_URL: z.string().url().default(BRAND.supportServer),
    INVITE_PERMISSIONS: z
      .string()
      .regex(/^\d{1,20}$/, "must be a decimal permission bitfield")
      .optional(),
  })
  .merge(botApiEnvSchema)
  .superRefine((value, ctx) => {
    if (value.SHARD_IDS.length > 0 && value.SHARD_IDS.some((id) => id >= value.SHARD_COUNT)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SHARD_IDS"],
        message: "every shard id must be lower than SHARD_COUNT",
      });
    }
    if (!value.BOT_API_HOST.match(/^[A-Za-z0-9.:[\]-]+$/)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BOT_API_HOST"],
        message: "must be a hostname or IP address",
      });
    }
  });

export type BotEnv = z.infer<typeof botEnvSchema>;

export function loadEnv(source: EnvSource = process.env): BotEnv {
  return parseEnv(botEnvSchema, source, BRAND.name + " bot");
}
