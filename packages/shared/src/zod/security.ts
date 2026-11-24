import { z } from "zod";
import { PUNISHMENTS, WHITELIST_TYPES } from "../constants";
import {
  domainSchema,
  inviteCodeSchema,
  optionalSnowflakeSchema,
  paginationSchema,
  reasonSchema,
  shortTextSchema,
  snowflakeSchema,
  zEnum,
} from "./common";

const threshold = (min: number, max: number) => z.number().int().min(min).max(max);

export const securityConfigSchema = z.object({
  antiRaidEnabled: z.boolean(),
  raidJoinThreshold: threshold(3, 100),
  raidWindowSeconds: threshold(5, 600),
  raidMinAccountAgeDays: threshold(0, 365),
  raidAction: zEnum(PUNISHMENTS),
  antiNukeEnabled: z.boolean(),
  nukeThreshold: threshold(2, 20),
  nukeWindowSeconds: threshold(10, 600),
  antiSpamEnabled: z.boolean(),
  spamThreshold: threshold(3, 30),
  spamWindowSeconds: threshold(3, 60),
  spamAction: zEnum(PUNISHMENTS),
  mentionLimit: threshold(0, 50),
  inviteFilterEnabled: z.boolean(),
  linkFilterEnabled: z.boolean(),
  phishingDetection: z.boolean(),
  allowedDomains: z.array(domainSchema).max(200),
  allowedInviteCodes: z.array(inviteCodeSchema).max(100),
  alertChannelId: optionalSnowflakeSchema,
  autoLockdown: z.boolean(),
});

export type SecurityConfigInput = z.infer<typeof securityConfigSchema>;

export const securityWhitelistEntrySchema = z.object({
  type: zEnum(WHITELIST_TYPES),
  value: shortTextSchema(253),
  note: z.string().max(200).optional(),
});

export const lockdownSchema = z.object({
  active: z.boolean(),
  reason: reasonSchema.optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
});

export const threatQuerySchema = paginationSchema.extend({
  type: zEnum([
    "MASS_JOIN",
    "RAID",
    "SPAM",
    "FLOOD",
    "MASS_MENTION",
    "INVITE",
    "LINK",
    "PHISHING",
    "MASS_CHANNEL_DELETE",
    "MASS_ROLE_DELETE",
    "MASS_BAN",
    "MASS_KICK",
    "WEBHOOK_CREATE",
    "PERMISSION_ESCALATION",
  ] as const).optional(),
  resolved: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .optional(),
  actorId: snowflakeSchema.optional(),
});

export const threatResolveSchema = z.object({
  resolved: z.boolean(),
});
