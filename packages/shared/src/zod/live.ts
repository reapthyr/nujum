import { z } from "zod";
import { BOT_ACTION_TYPES, LIVE_ACTION_STATUSES } from "../constants";
import {
  idSchema,
  optionalSnowflakeSchema,
  shortTextSchema,
  snowflakeSchema,
  zEnum,
} from "./common";
import {
  announcementBodySchema,
  lockdownBodySchema,
  publishVerificationBodySchema,
  sendMessageBodySchema,
} from "./bot-api";

/**
 * Only these shapes may enter the durable queue. A queued action is data, never
 * executable code, and is re-validated when the bot drains it.
 */
export const queuedBotActionSchema = z.union([
  z.object({ type: z.literal("SEND_MESSAGE"), payload: sendMessageBodySchema }),
  z.object({ type: z.literal("ANNOUNCEMENT"), payload: announcementBodySchema }),
  z.object({
    type: z.literal("PUBLISH_VERIFICATION_PANEL"),
    payload: publishVerificationBodySchema,
  }),
  z.object({ type: z.literal("SET_LOCKDOWN"), payload: lockdownBodySchema }),
]);

export type QueuedBotAction = z.infer<typeof queuedBotActionSchema>;
export type QueuedBotActionType = (typeof BOT_ACTION_TYPES)[number];

export const botGuildSnapshotSchema = z.object({
  online: z.boolean(),
  guild: z.object({
    id: snowflakeSchema,
    name: shortTextSchema(100),
    memberCount: z.number().int().min(0),
    iconUrl: z.string().url().nullable(),
    ownerId: snowflakeSchema,
    botPermissions: z.array(shortTextSchema(64)).max(60),
  }),
  channels: z
    .array(
      z.object({
        id: snowflakeSchema,
        name: shortTextSchema(100),
        type: zEnum(["text", "voice", "other"] as const),
        parentId: optionalSnowflakeSchema,
      }),
    )
    .max(500),
  roles: z
    .array(
      z.object({
        id: snowflakeSchema,
        name: shortTextSchema(100),
        color: z.number().int().min(0).max(0xffffff),
        position: z.number().int(),
      }),
    )
    .max(500),
});

export type BotGuildSnapshot = z.infer<typeof botGuildSnapshotSchema>;

/** Read-only Bot API heartbeat used by the dashboard's offline badge. */
export const botMetaSchema = z.object({
  version: shortTextSchema(64),
  apiVersion: shortTextSchema(16),
  shards: z.number().int().min(1),
  pingMs: z.number().int().min(0),
  uptimeSeconds: z.number().int().min(0),
  guildCount: z.number().int().min(0),
  userCount: z.number().int().min(0),
  queueDepth: z.number().int().min(0),
  startedAt: z.string().datetime(),
});

export type BotMeta = z.infer<typeof botMetaSchema>;

export const botActionResultSchema = z.object({
  type: zEnum(BOT_ACTION_TYPES),
  status: zEnum(LIVE_ACTION_STATUSES),
  messageId: optionalSnowflakeSchema,
  detail: z.string().max(200).optional(),
});

export type BotActionResult = z.infer<typeof botActionResultSchema>;

export const queueDrainResultSchema = z.object({
  claimed: z.number().int().min(0),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
});

export type QueueDrainResult = z.infer<typeof queueDrainResultSchema>;

export const pendingActionViewSchema = z.object({
  id: idSchema,
  guildId: snowflakeSchema,
  type: shortTextSchema(64),
  status: zEnum(["PENDING", "PROCESSING", "SENT", "FAILED", "CANCELLED"] as const),
  attempts: z.number().int().min(0),
  lastError: z.string().max(300).nullable(),
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});
