import { z } from "zod";
import { CONFIG_SOURCES } from "../types/config";
import { shortTextSchema, snowflakeSchema, zEnum } from "./common";

/**
 * Payload carried by `NOTIFY nujum_config`. It is a signal only — the bot always
 * re-reads configuration from the database after receiving it.
 */
export const configNotifyPayloadSchema = z.object({
  guildId: snowflakeSchema,
  version: z.number().int().min(1),
  source: zEnum(CONFIG_SOURCES),
  action: shortTextSchema(64).optional(),
  changedBy: snowflakeSchema.optional(),
  at: z.string().datetime(),
});

export type ConfigNotifyPayloadInput = z.input<typeof configNotifyPayloadSchema>;
