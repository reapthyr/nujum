import { z } from "zod";
import { AUTO_ROLE_TRIGGERS, VERIFICATION_MODES } from "../constants";
import {
  embedSchema,
  optionalSnowflakeSchema,
  snowflakeSchema,
  timezoneSchema,
  zEnum,
} from "./common";

export const WELCOME_PLACEHOLDERS = [
  "{user}",
  "{username}",
  "{server}",
  "{memberCount}",
  "{createdAt}",
  "{joinedAt}",
  "{inviter}",
] as const;

export const welcomeConfigSchema = z.object({
  welcomeEnabled: z.boolean(),
  welcomeChannelId: optionalSnowflakeSchema,
  welcomeMessage: z.string().min(1).max(2000),
  welcomeEmbed: embedSchema.nullable(),
  goodbyeEnabled: z.boolean(),
  goodbyeChannelId: optionalSnowflakeSchema,
  goodbyeMessage: z.string().min(1).max(2000),
  goodbyeEmbed: embedSchema.nullable(),
  dmEnabled: z.boolean(),
  dmMessage: z.string().max(2000).nullable(),
});

export const verificationConfigSchema = z.object({
  enabled: z.boolean(),
  mode: zEnum(VERIFICATION_MODES),
  channelId: optionalSnowflakeSchema,
  roleId: optionalSnowflakeSchema,
  minAccountAgeDays: z.number().int().min(0).max(365),
  message: z.string().min(1).max(2000),
  embed: embedSchema.nullable(),
  captchaProvider: zEnum(["turnstile"] as const)
    .nullable()
    .optional(),
});

export const verificationSubmitSchema = z.object({
  code: z.string().max(128).optional(),
});

export const autoRoleSchema = z.object({
  roleId: snowflakeSchema,
  trigger: zEnum(AUTO_ROLE_TRIGGERS),
  delaySeconds: z.number().int().min(0).max(3600),
  enabled: z.boolean(),
});

export const welcomePreviewSchema = z.object({
  message: z.string().min(1).max(2000),
  embed: embedSchema.nullable(),
  timezone: timezoneSchema.optional(),
});
