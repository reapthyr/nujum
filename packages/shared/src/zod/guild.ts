import { z } from "zod";
import { MODULE_KEYS } from "../constants";
import {
  hexColorSchema,
  jsonObjectSchema,
  localeSchema,
  shortTextSchema,
  snowflakeSchema,
  timezoneSchema,
  zEnum,
} from "./common";

export const generalSettingsSchema = z.object({
  locale: localeSchema,
  brandColor: hexColorSchema,
  embedFooter: z.string().max(2048).nullable(),
  botNickname: z
    .string()
    .max(32)
    .transform((value) => value.trim())
    .refine((value) => value.length >= 1, "nickname cannot be empty")
    .nullable(),
  timezone: timezoneSchema,
});

export const moduleToggleSchema = z.object({
  key: zEnum(MODULE_KEYS),
  enabled: z.boolean(),
});

export const moduleSettingsSchema = z.object({
  key: zEnum(MODULE_KEYS),
  enabled: z.boolean(),
  settings: jsonObjectSchema.default({}),
});

export type ModuleSettingsInput = z.infer<typeof moduleSettingsSchema>;

export const guildIdParamSchema = z.object({
  guildId: snowflakeSchema,
});

export const guildIdWithIdParamSchema = z.object({
  guildId: snowflakeSchema,
  id: z.string().min(1).max(64),
});

export const guildUpdateSchema = z.object({
  name: shortTextSchema(100).optional(),
  iconHash: z.string().max(128).nullable().optional(),
  ownerId: snowflakeSchema.optional(),
});
