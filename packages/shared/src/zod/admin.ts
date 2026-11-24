import { z } from "zod";
import { BLACKLIST_TYPES, PRESENCE_STATUSES } from "../constants";
import { normalizeDomain } from "../sanitize";
import {
  confirmSchema,
  embedSchema,
  httpsUrlSchema,
  paginationSchema,
  reasonSchema,
  shortTextSchema,
  snowflakeArraySchema,
  zEnum,
} from "./common";

export const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z
    .string()
    .max(500)
    .default("Nujum is undergoing maintenance. Please try again shortly."),
});

export const presenceActivitySchema = z.object({
  type: zEnum(["Playing", "Watching", "Listening", "Competing", "Custom"] as const),
  name: z.string().min(1).max(128),
  url: httpsUrlSchema.optional(),
  state: z.string().max(128).optional(),
});

export const presenceSchema = z.object({
  status: zEnum(PRESENCE_STATUSES),
  activities: z.array(presenceActivitySchema).max(5),
});

export const featureFlagSchema = z.object({
  enabled: z.boolean(),
  description: z.string().max(200).nullable(),
  guildAllowlist: snowflakeArraySchema(500),
});

export const adminGuildQuerySchema = paginationSchema.extend({
  q: z.string().max(100).optional(),
  blacklisted: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .optional(),
});

const broadcastTargetSchema = z.union([
  z.literal("ALL"),
  z.object({ guildIds: snowflakeArraySchema(100, 1) }),
]);

export const broadcastSchema = z.object({
  embed: embedSchema,
  target: broadcastTargetSchema,
  paceMs: z.number().int().min(500).max(5000).default(1200),
  confirm: confirmSchema,
});

export const adminBlacklistSchema = z
  .object({
    type: zEnum(BLACKLIST_TYPES),
    value: shortTextSchema(253),
    reason: reasonSchema,
    expiresAt: z.coerce.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "USER" || value.type === "GUILD") {
      if (!/^\d{16,20}$/.test(value.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "must be a Discord snowflake id",
        });
      }
      return;
    }
    if (value.type === "DOMAIN" && !normalizeDomain(value.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "must be a valid domain",
      });
    }
  });

export const maintenanceReadSchema = z.object({
  enabled: z.boolean(),
  message: z.string(),
  since: z.string().nullable(),
});
