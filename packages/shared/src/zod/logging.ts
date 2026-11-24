import { z } from "zod";
import { IGNORE_TYPES, LOG_EVENTS } from "../constants";
import { optionalSnowflakeSchema, snowflakeSchema, zEnum } from "./common";

export const loggingConfigSchema = z.object({
  enabled: z.boolean(),
  defaultChannelId: optionalSnowflakeSchema,
});

export const logRouteSchema = z.object({
  event: zEnum(LOG_EVENTS),
  channelId: snowflakeSchema,
  enabled: z.boolean().default(true),
});

export const logRoutesSchema = z
  .array(logRouteSchema)
  .max(LOG_EVENTS.length)
  .refine(
    (routes) => new Set(routes.map((route) => route.event)).size === routes.length,
    "each event can only be routed once",
  );

export const logIgnoreSchema = z.object({
  type: zEnum(IGNORE_TYPES),
  targetId: snowflakeSchema,
  event: zEnum(LOG_EVENTS).nullable().optional(),
});
