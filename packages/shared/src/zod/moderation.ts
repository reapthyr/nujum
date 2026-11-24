import { z } from "zod";
import { CASE_STATUSES, CASE_TYPES, MODERATION_DEFAULTS, PUNISHMENTS } from "../constants";
import {
  dateRangeFields,
  optionalSnowflakeSchema,
  paginationSchema,
  reasonSchema,
  shortTextSchema,
  snowflakeSchema,
  withValidDateRange,
  zEnum,
} from "./common";

export const moderationConfigSchema = z.object({
  modLogChannelId: optionalSnowflakeSchema,
  dmOnAction: z.boolean(),
  appealInfo: z.string().max(2000).nullable(),
  warnExpiryDays: z.number().int().min(0).max(3650),
  autoEscalate: z.boolean(),
  requireReason: z.boolean(),
  mutedRoleId: optionalSnowflakeSchema,
});

export const escalationRuleSchema = z.object({
  warnCount: z.number().int().min(1).max(100),
  action: zEnum(PUNISHMENTS),
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 365)
    .nullable(),
});

export const escalationRulesSchema = z
  .array(escalationRuleSchema)
  .max(MODERATION_DEFAULTS.maxEscalationRules)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.warnCount)).size === rules.length,
    "warn thresholds must be unique",
  );

export const caseQuerySchema = withValidDateRange(
  paginationSchema.extend({
    ...dateRangeFields,
    type: zEnum(CASE_TYPES).optional(),
    status: zEnum(CASE_STATUSES).optional(),
    targetId: snowflakeSchema.optional(),
    moderatorId: snowflakeSchema.optional(),
    q: z.string().max(100).optional(),
  }),
);

export const revokeCaseSchema = z.object({
  reason: reasonSchema,
});

export const appealDecisionSchema = z.object({
  decision: zEnum(["APPROVE", "DENY"] as const),
  reason: reasonSchema,
});

export const purgeSchema = z
  .object({
    count: z.number().int().min(1).max(MODERATION_DEFAULTS.maxPurge),
    userId: snowflakeSchema.optional(),
    contains: z.string().max(200).optional(),
    botsOnly: z.boolean().optional(),
    humansOnly: z.boolean().optional(),
  })
  .refine((value) => !(value.botsOnly && value.humansOnly), "choose botsOnly or humansOnly");

export const timeoutSchema = z.object({
  durationSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 28),
  reason: reasonSchema,
});

export const warnSchema = z.object({
  reason: reasonSchema,
  silent: z.boolean().default(false),
});

export const caseNoteSchema = z.object({
  content: shortTextSchema(2000),
  staffOnly: z.boolean().default(true),
});
