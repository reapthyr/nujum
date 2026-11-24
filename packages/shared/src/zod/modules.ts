import { z } from "zod";
import {
  KEYWORD_MATCH_TYPES,
  LEVELING_DEFAULTS,
  STAT_CHANNEL_TYPES,
  SUGGESTION_STATUSES,
} from "../constants";
import {
  cronSchema,
  messagePayloadSchema,
  optionalSnowflakeSchema,
  paginationSchema,
  shortTextSchema,
  snowflakeArraySchema,
  snowflakeSchema,
  timezoneSchema,
  zEnum,
} from "./common";

// ── leveling ───────────────────────────────────────────────────────────────

export const xpCurveSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("linear"),
    base: z.number().int().min(50).max(1000),
    step: z.number().int().min(10).max(1000).default(50),
  }),
  z.object({
    type: z.literal("quadratic"),
    base: z.number().int().min(50).max(1000),
    factor: z.number().min(0.5).max(5).default(1),
  }),
  z.object({
    type: z.literal("exponential"),
    base: z.number().int().min(50).max(1000),
    multiplier: z.number().min(1.01).max(3).default(1.15),
  }),
]);

export const levelConfigSchema = z
  .object({
    enabled: z.boolean(),
    xpMin: z.number().int().min(1).max(100),
    xpMax: z.number().int().min(1).max(200),
    cooldownSeconds: z.number().int().min(0).max(3600),
    announceChannelId: optionalSnowflakeSchema,
    announceLevelUp: z.boolean(),
    noXpChannelIds: snowflakeArraySchema(50),
    noXpRoleIds: snowflakeArraySchema(50),
    stackRoles: z.boolean(),
    curve: xpCurveSchema,
  })
  .refine((value) => value.xpMin <= value.xpMax, {
    message: "xpMin must be less than or equal to xpMax",
    path: ["xpMin"],
  });

export const levelRoleSchema = z.object({
  level: z.number().int().min(1).max(LEVELING_DEFAULTS.maxLevel),
  roleId: snowflakeSchema,
});

// ── giveaways ──────────────────────────────────────────────────────────────

export const giveawayRequirementsSchema = z.object({
  roleIds: snowflakeArraySchema(10).default([]),
  level: z.number().int().min(0).max(LEVELING_DEFAULTS.maxLevel).optional(),
  accountAgeDays: z.number().int().min(0).max(365).optional(),
  boosterOnly: z.boolean().default(false),
});

export const giveawayCreateSchema = z.object({
  channelId: snowflakeSchema,
  prize: z
    .string()
    .min(1)
    .max(256)
    .transform((value) => value.trim()),
  description: z.string().max(1000).nullable().optional(),
  winnerCount: z.number().int().min(1).max(20).default(1),
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 30),
  requirements: giveawayRequirementsSchema.default({ roleIds: [], boosterOnly: false }),
});

export const giveawayActionSchema = z.object({
  reason: z.string().max(300).optional(),
});

export const giveawayQuerySchema = paginationSchema.extend({
  status: zEnum(["SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"] as const).optional(),
});

// ── suggestions / polls / starboard ────────────────────────────────────────

export const suggestionCreateSchema = z.object({
  content: z.string().min(3).max(2000),
});

export const suggestionActionSchema = z.object({
  status: zEnum(SUGGESTION_STATUSES),
  response: z.string().max(1000).optional(),
});

export const suggestionQuerySchema = paginationSchema.extend({
  status: zEnum(SUGGESTION_STATUSES).optional(),
});

export const pollCreateSchema = z.object({
  channelId: snowflakeSchema,
  question: z
    .string()
    .min(1)
    .max(300)
    .transform((value) => value.trim()),
  options: z
    .array(
      z
        .string()
        .min(1)
        .max(100)
        .transform((value) => value.trim()),
    )
    .min(2)
    .max(10)
    .refine((options) => new Set(options).size === options.length, "options must be unique"),
  multiple: z.boolean().default(false),
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 30)
    .optional(),
});

export const pollQuerySchema = paginationSchema.extend({
  status: zEnum(["OPEN", "CLOSED"] as const).optional(),
});

export const starboardConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: optionalSnowflakeSchema,
  emoji: z.string().min(1).max(64),
  threshold: z.number().int().min(1).max(50),
  allowSelfStar: z.boolean(),
  ignoreBots: z.boolean(),
});

// ── reminders / afk / birthdays / temp roles ───────────────────────────────

export const reminderSchema = z.object({
  message: z.string().min(1).max(1500),
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 365),
  channelId: optionalSnowflakeSchema,
});

export const afkSchema = z.object({
  message: z.string().max(200).default("AFK"),
});

export const birthdaySchema = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(1900).max(new Date().getUTCFullYear()).nullable(),
    timezone: timezoneSchema,
  })
  .refine(
    (value) => new Date(Date.UTC(2000, value.month - 1, value.day)).getUTCDate() === value.day,
    { message: "invalid day for the selected month", path: ["day"] },
  );

export const tempRoleSchema = z.object({
  userId: snowflakeSchema,
  roleId: snowflakeSchema,
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 365),
});

// ── stat channels / announcements / faq ────────────────────────────────────

export const statChannelSchema = z.object({
  channelId: snowflakeSchema,
  type: zEnum(STAT_CHANNEL_TYPES),
  template: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => value.includes("{count}"), "template must contain {count}"),
  enabled: z.boolean().default(true),
});

export const scheduledAnnouncementSchema = z.object({
  channelId: snowflakeSchema,
  name: shortTextSchema(80),
  payload: messagePayloadSchema,
  cron: cronSchema,
  timezone: timezoneSchema,
  enabled: z.boolean().default(true),
});

export const faqSchema = z.object({
  question: z
    .string()
    .min(1)
    .max(256)
    .transform((value) => value.trim()),
  answer: z.string().min(1).max(4000),
  keywords: z.array(z.string().min(1).max(50)).max(20).default([]),
  enabled: z.boolean().default(true),
});

export const keywordSchema = z
  .object({
    trigger: z
      .string()
      .min(1)
      .max(100)
      .transform((value) => value.trim()),
    matchType: zEnum(KEYWORD_MATCH_TYPES),
    response: z.string().min(1).max(2000),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.matchType !== "REGEX") return;
    try {
      new RegExp(value.trigger);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trigger"],
        message: "invalid regular expression",
      });
    }
  });
