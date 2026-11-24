import { z } from "zod";
import {
  optionalSnowflakeSchema,
  shortTextSchema,
  snowflakeArraySchema,
  snowflakeSchema,
} from "./common";

const regionSchema = z
  .string()
  .max(32)
  .regex(/^(auto|[a-z]{2,}(-[a-z]+)*)$/, "invalid voice region");

export const jtcConfigSchema = z.object({
  enabled: z.boolean(),
  generatorChannelId: optionalSnowflakeSchema,
  categoryId: optionalSnowflakeSchema,
  nameTemplate: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => value.includes("{username}"), "must contain {username}"),
  defaultLimit: z.number().int().min(0).max(99),
  defaultBitrate: z.number().int().min(8).max(384),
  defaultRegion: regionSchema.nullable(),
  panelChannelId: optionalSnowflakeSchema,
  interfaceChannelId: optionalSnowflakeSchema,
  trustedRoleIds: snowflakeArraySchema(20),
});

export const jtcPresetSchema = z.object({
  name: shortTextSchema(32),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  userLimit: z.number().int().min(0).max(99).default(0),
  bitrate: z.number().int().min(8).max(384).default(64),
  region: regionSchema.nullable().default(null),
  isDefault: z.boolean().default(false),
});

export const JTC_ACTIONS = [
  "LOCK",
  "UNLOCK",
  "HIDE",
  "UNHIDE",
  "RENAME",
  "LIMIT",
  "BITRATE",
  "REGION",
  "KICK",
  "BAN",
  "PERMIT",
  "TRANSFER",
  "CLAIM",
  "INVITE",
] as const;
export type JtcAction = (typeof JTC_ACTIONS)[number];

export const jtcActionSchema = z
  .object({
    action: z.enum(JTC_ACTIONS),
    userId: snowflakeSchema.optional(),
    name: z
      .string()
      .max(80)
      .transform((value) => value.trim())
      .optional(),
    value: z.number().int().min(0).max(384).optional(),
    region: regionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const needsUser = ["KICK", "BAN", "PERMIT", "TRANSFER"] as const;
    if (needsUser.includes(value.action as (typeof needsUser)[number]) && !value.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userId"],
        message: "userId is required",
      });
    }
    if (value.action === "RENAME" && !value.name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "name is required" });
    }
    if ((value.action === "LIMIT" || value.action === "BITRATE") && value.value === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "value is required" });
    }
    if (value.action === "REGION" && !value.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
        message: "region is required",
      });
    }
  });
