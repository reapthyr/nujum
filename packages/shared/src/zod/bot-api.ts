import { z } from "zod";
import { BOT_API_ERROR_CODES } from "../types/api";
import {
  allowedMentionsSchema,
  embedSchema,
  optionalSnowflakeSchema,
  paginationSchema,
  reasonSchema,
  snowflakeSchema,
  zEnum,
} from "./common";
import { lockdownSchema } from "./security";
import { rolePanelPublishSchema, rolePanelSyncSchema } from "./roles";

// ── path params ────────────────────────────────────────────────────────────

export const guildPathParamsSchema = z.object({
  guildId: snowflakeSchema,
});

export const panelPathParamsSchema = z.object({
  guildId: snowflakeSchema,
  panelId: z.string().min(1).max(64),
});

export const memberPathParamsSchema = z.object({
  guildId: snowflakeSchema,
  userId: snowflakeSchema,
});

export const casePathParamsSchema = z.object({
  guildId: snowflakeSchema,
  caseId: z.string().min(1).max(64),
});

export const giveawayPathParamsSchema = z.object({
  guildId: snowflakeSchema,
  giveawayId: z.string().min(1).max(64),
});

export const featureFlagPathParamsSchema = z.object({
  name: z.string().regex(/^[a-z0-9_.-]{2,64}$/),
});

// ── reads ──────────────────────────────────────────────────────────────────

export const listGuildsQuerySchema = paginationSchema.extend({
  q: z.string().max(100).optional(),
});

export const memberSearchQuerySchema = z.object({
  query: z.string().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(64).optional(),
});

export const logQuerySchema = z.object({
  level: zEnum(["trace", "debug", "info", "warn", "error", "fatal"] as const).default("info"),
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// ── live actions ───────────────────────────────────────────────────────────

export const publishTicketPanelBodySchema = z.object({
  channelId: optionalSnowflakeSchema,
  preview: z.boolean().default(false),
});

export const publishRolePanelBodySchema = rolePanelPublishSchema;
export const syncRolePanelBodySchema = rolePanelSyncSchema;

export const publishVerificationBodySchema = z.object({
  channelId: optionalSnowflakeSchema,
});

export const sendMessageBodySchema = z
  .object({
    channelId: snowflakeSchema,
    content: z.string().max(2000).optional(),
    embeds: z.array(embedSchema).max(10).optional(),
    allowedMentions: allowedMentionsSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.content?.trim()) || Boolean(value.embeds?.length),
    "content or at least one embed is required",
  );

export const announcementBodySchema = z
  .object({
    channelId: snowflakeSchema,
    content: z.string().max(2000).optional(),
    embed: embedSchema.optional(),
    mentionEveryone: z.boolean().default(false),
    confirm: z.boolean().optional(),
  })
  .refine(
    (value) => Boolean(value.content?.trim()) || Boolean(value.embed),
    "content or an embed is required",
  )
  .refine((value) => !value.mentionEveryone || value.confirm === true, {
    message: "mentioning @everyone requires confirm: true",
    path: ["confirm"],
  });

export const lockdownBodySchema = lockdownSchema;

export type SendMessageInput = z.infer<typeof sendMessageBodySchema>;
export type AnnouncementInput = z.infer<typeof announcementBodySchema>;
export type PublishVerificationInput = z.infer<typeof publishVerificationBodySchema>;
export type LockdownInput = z.infer<typeof lockdownBodySchema>;

export const revokeCaseBodySchema = z.object({
  reason: reasonSchema,
});

export const giveawayActionBodySchema = z.object({
  reason: z.string().max(300).optional(),
});

export const queueDrainBodySchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

// ── error contract (validated by the dashboard client) ─────────────────────

export const botApiErrorCodeSchema = zEnum(BOT_API_ERROR_CODES);

export const botApiErrorResponseSchema = z.object({
  error: z.object({
    code: botApiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export const botApiSuccessResponseSchema = z.object({
  data: z.unknown(),
  requestId: z.string().min(1),
});
