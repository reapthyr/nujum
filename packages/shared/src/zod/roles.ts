import { z } from "zod";
import { PANEL_TYPES, ROLE_PANEL_MODES } from "../constants";
import { optionalSnowflakeSchema, shortTextSchema, snowflakeSchema, zEnum } from "./common";

export const rolePanelOptionSchema = z.object({
  roleId: snowflakeSchema,
  label: z
    .string()
    .min(1)
    .max(80)
    .transform((value) => value.trim()),
  emoji: z.string().max(64).nullable().optional(),
  description: z.string().max(100).nullable().optional(),
  style: z.number().int().min(1).max(4).default(2),
});

export const rolePanelInputSchema = z
  .object({
    channelId: snowflakeSchema,
    title: z
      .string()
      .min(1)
      .max(256)
      .transform((value) => value.trim()),
    description: z.string().max(2000).nullable(),
    type: zEnum(PANEL_TYPES),
    mode: zEnum(ROLE_PANEL_MODES),
    maxRoles: z.number().int().min(0).max(25),
    options: z.array(rolePanelOptionSchema).min(1).max(25),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.options.map((option) => option.roleId)).size !== value.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "each role can only appear once",
      });
    }
    if (value.type === "BUTTONS" && value.options.length > 5 && value.mode !== "MULTI") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "button panels are limited to 5 roles unless the panel is multi-select",
      });
    }
  });

export const rolePanelPublishSchema = z.object({
  channelId: optionalSnowflakeSchema,
});

export const rolePanelSyncSchema = z.object({
  dryRun: z.boolean().default(true),
});

export const rolePanelQuerySchema = z.object({
  panelId: z.string().min(1).max(64).optional(),
});

export const rolePanelRenameSchema = z.object({
  title: shortTextSchema(256),
});
