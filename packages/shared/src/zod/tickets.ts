import { z } from "zod";
import { PANEL_TYPES, TICKET_DEFAULTS, TICKET_PRIORITIES, TICKET_STATUSES } from "../constants";
import {
  embedSchema,
  optionalReasonSchema,
  optionalSnowflakeSchema,
  paginationSchema,
  shortTextSchema,
  idArraySchema,
  snowflakeArraySchema,
  snowflakeSchema,
  zEnum,
} from "./common";

export const ticketFormFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{1,32}$/, "use lowercase letters, digits and underscores"),
    label: z.string().min(1).max(45),
    placeholder: z.string().max(100).optional(),
    required: z.boolean().default(false),
    style: zEnum(["SHORT", "PARAGRAPH"] as const).default("SHORT"),
    minLength: z.number().int().min(0).max(1024).optional(),
    maxLength: z.number().int().min(1).max(1024).optional(),
  })
  .refine(
    (value) =>
      value.minLength === undefined ||
      value.maxLength === undefined ||
      value.minLength <= value.maxLength,
    { message: "minLength must be less than or equal to maxLength", path: ["minLength"] },
  );

const ticketCategoryShape = {
  name: z
    .string()
    .min(1)
    .max(80)
    .transform((value) => value.trim()),
  emoji: z.string().max(64).nullable().optional(),
  description: z.string().max(200).nullable().optional(),
  discordCategoryId: optionalSnowflakeSchema,
  supportRoleIds: snowflakeArraySchema(TICKET_DEFAULTS.maxSupportRoles),
  formFields: z.array(ticketFormFieldSchema).max(TICKET_DEFAULTS.maxFormFields),
  position: z.number().int().min(0).max(100).default(0),
  enabled: z.boolean().default(true),
} as const;

function assertUniqueFieldKeys(
  value: { formFields: readonly { key: string }[] },
  ctx: z.RefinementCtx,
): void {
  if (new Set(value.formFields.map((field) => field.key)).size !== value.formFields.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["formFields"],
      message: "form field keys must be unique",
    });
  }
}

export const ticketConfigSchema = z.object({
  enabled: z.boolean(),
  panelChannelId: optionalSnowflakeSchema,
  transcriptChannelId: optionalSnowflakeSchema,
  logChannelId: optionalSnowflakeSchema,
  supportRoleIds: snowflakeArraySchema(TICKET_DEFAULTS.maxSupportRoles),
  maxOpenPerUser: z.number().int().min(1).max(10),
  inactivityHours: z.number().int().min(1).max(720),
  warnBeforeHours: z.number().int().min(0).max(168),
  namingFormat: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9{}_-]+$/, "use lowercase letters, digits, dashes, underscores and {number}")
    .refine((value) => value.includes("{number}"), "must contain {number}"),
  ratingEnabled: z.boolean(),
});

export const ticketCategoryInputSchema = z
  .object(ticketCategoryShape)
  .superRefine(assertUniqueFieldKeys);

const ticketCategoryIdSchema = z.string().min(1).max(64);

export const ticketCategoryCreateInputSchema = ticketCategoryInputSchema;
export const ticketCategoryUpdateInputSchema = z
  .object({ ...ticketCategoryShape, id: ticketCategoryIdSchema })
  .superRefine(assertUniqueFieldKeys);
export const ticketCategoryDeleteInputSchema = z.object({ id: ticketCategoryIdSchema });

export const ticketPanelInputSchema = z.object({
  channelId: snowflakeSchema,
  type: zEnum(PANEL_TYPES),
  embed: embedSchema,
  categoryIds: idArraySchema(TICKET_DEFAULTS.maxCategories, 1),
});

export const TICKET_ACTIONS = [
  "CLAIM",
  "CLOSE",
  "ADD_USER",
  "REMOVE_USER",
  "RENAME",
  "TRANSFER",
  "PRIORITY",
  "NOTE",
  "CALL_STAFF",
] as const;
export type TicketAction = (typeof TICKET_ACTIONS)[number];

export const ticketActionSchema = z
  .object({
    action: zEnum(TICKET_ACTIONS),
    userId: snowflakeSchema.optional(),
    name: z
      .string()
      .max(100)
      .transform((value) => value.trim())
      .optional(),
    priority: zEnum(TICKET_PRIORITIES).optional(),
    reason: optionalReasonSchema,
  })
  .superRefine((value, ctx) => {
    const require = (field: "userId" | "name" | "priority", message: string): void => {
      if (value[field] === undefined || value[field] === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      }
    };
    switch (value.action) {
      case "ADD_USER":
      case "REMOVE_USER":
      case "TRANSFER":
        require("userId", "userId is required for this action");
        break;
      case "RENAME":
        require("name", "name is required for this action");
        break;
      case "PRIORITY":
        require("priority", "priority is required for this action");
        break;
      case "NOTE":
        if (!value.reason) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reason"],
            message: "note content is required",
          });
        }
        break;
      default:
        break;
    }
  });

export const ticketNoteSchema = z.object({
  content: shortTextSchema(2000),
});

export const ticketRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const ticketBlacklistSchema = z.object({
  userId: snowflakeSchema,
  reason: shortTextSchema(300),
  expiresAt: z.coerce.date().optional(),
});

export const ticketQuerySchema = paginationSchema.extend({
  status: zEnum(TICKET_STATUSES).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  openerId: snowflakeSchema.optional(),
  claimedBy: snowflakeSchema.optional(),
  priority: zEnum(TICKET_PRIORITIES).optional(),
  q: z.string().max(100).optional(),
});

export type TicketConfigInput = z.infer<typeof ticketConfigSchema>;
export type TicketCategoryInput = z.infer<typeof ticketCategoryInputSchema>;
export type TicketCategoryUpdateInput = z.infer<typeof ticketCategoryUpdateInputSchema>;
export type TicketPanelInput = z.infer<typeof ticketPanelInputSchema>;
