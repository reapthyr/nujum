import { z } from "zod";
import { LOCALES, PAGINATION } from "../constants";
import { normalizeDomain, parseColor, sanitizeSingleLine, truncate } from "../sanitize";

/** Builds a zod enum from a `as const` string tuple. */
export function zEnum<T extends string>(values: readonly T[]): z.ZodEnum<[T, ...T[]]> {
  return z.enum(values as unknown as [T, ...T[]]);
}

export const snowflakeSchema = z.string().regex(/^\d{16,20}$/, "must be a Discord snowflake id");
export const optionalSnowflakeSchema = snowflakeSchema.nullish();
export const idSchema = z.string().min(1).max(64);
export const cuidSchema = z.string().regex(/^c[a-z0-9]{20,40}$/i, "invalid id");
export const localeSchema = zEnum(LOCALES);

const colorInputSchema = z.union([
  z.number().int().min(0).max(0xffffff),
  z.string().regex(/^#?[0-9a-fA-F]{6}$/, "must be #RRGGBB or an integer"),
]);

export const hexColorSchema = colorInputSchema.transform((value, ctx) => {
  const parsed = parseColor(value);
  if (parsed === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid color" });
    return z.NEVER;
  }
  return parsed;
});

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }, "must be a valid IANA timezone");

export const httpsUrlSchema = z
  .string()
  .max(2048)
  .url("must be a valid URL")
  .refine((value) => /^https:\/\//i.test(value), "must use https");

export const imageUrlSchema = httpsUrlSchema;

export const domainSchema = z
  .string()
  .min(3)
  .max(253)
  .transform((value, ctx) => {
    const domain = normalizeDomain(value);
    if (!domain) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid domain" });
      return z.NEVER;
    }
    return domain;
  });

export const inviteCodeSchema = z.string().regex(/^[a-zA-Z0-9-]{2,32}$/, "invalid invite code");

export const hexNonceSchema = z.string().regex(/^[a-f0-9]{16,128}$/i, "invalid nonce");

export const reasonSchema = z
  .string()
  .max(1000)
  .transform((value) => sanitizeSingleLine(value, 1000))
  .refine((value) => value.length >= 1, "a reason is required");

export const optionalReasonSchema = z
  .string()
  .max(1000)
  .transform((value) => sanitizeSingleLine(value, 1000))
  .refine((value) => value.length >= 1, "reason cannot be empty")
  .optional();

export const shortTextSchema = (max = 200) =>
  z
    .string()
    .max(max)
    .transform((value) => sanitizeSingleLine(value, max))
    .refine((value) => value.length >= 1, "cannot be empty");

export const longTextSchema = (max = 4000) =>
  z
    .string()
    .max(max)
    .transform((value) => value.replace(/\r\n/g, "\n").trim())
    .refine((value) => value.length >= 1, "cannot be empty");

export function snowflakeArraySchema(max = 50, min = 0) {
  return z
    .array(snowflakeSchema)
    .min(min)
    .max(max)
    .refine((values) => new Set(values).size === values.length, "duplicate ids are not allowed");
}

export const paginationSchema = z.object({
  cursor: z.string().max(PAGINATION.maxCursorLength).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});

export const dateRangeFields = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
} as const;

export function withValidDateRange<T extends z.ZodTypeAny>(schema: T): T {
  return schema.refine((value: { from?: Date; to?: Date }) => {
    return !value.from || !value.to || value.from.getTime() <= value.to.getTime();
  }, "from must be before to") as unknown as T;
}

export const dateRangeSchema = withValidDateRange(z.object(dateRangeFields));

export const confirmSchema = z.literal(true, {
  errorMap: () => ({ message: "explicit confirmation is required" }),
});

export const cronSchema = z
  .string()
  .regex(
    /^(\*|[0-9*/,-]+)\s+(\*|[0-9*/,-]+)\s+(\*|[0-9*/,-]+)\s+(\*|[0-9*/,-]+)\s+(\*|[0-9*/,-]+)$/,
    "must be a 5-field cron expression",
  );

export const durationSecondsSchema = z
  .number()
  .int()
  .min(60)
  .max(60 * 60 * 24 * 365);

// ── Discord embed / message contracts ──────────────────────────────────────

const embedFieldSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: z.boolean().optional(),
});

const embedFooterSchema = z.object({
  text: z.string().min(1).max(2048),
  iconUrl: imageUrlSchema.optional(),
});

const embedAuthorSchema = z.object({
  name: z.string().min(1).max(256),
  url: httpsUrlSchema.optional(),
  iconUrl: imageUrlSchema.optional(),
});

export const embedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(4096).optional(),
    url: httpsUrlSchema.optional(),
    color: hexColorSchema.optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
    footer: embedFooterSchema.optional(),
    image: z.object({ url: imageUrlSchema }).optional(),
    thumbnail: z.object({ url: imageUrlSchema }).optional(),
    author: embedAuthorSchema.optional(),
    fields: z.array(embedFieldSchema).max(25).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.title ||
        value.description ||
        value.author ||
        value.image ||
        value.thumbnail ||
        (value.fields && value.fields.length > 0),
      ),
    "an embed needs a title, description, author, image or field",
  );

export const allowedMentionsSchema = z.object({
  parse: z
    .array(zEnum(["roles", "users", "everyone"] as const))
    .max(3)
    .default([]),
  roles: z.array(snowflakeSchema).max(100).optional(),
  users: z.array(snowflakeSchema).max(100).optional(),
  repliedUser: z.boolean().optional(),
});

export const messagePayloadSchema = z
  .object({
    content: z.string().max(2000).optional(),
    embeds: z.array(embedSchema).max(10).optional(),
    allowedMentions: allowedMentionsSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.content?.trim()) || Boolean(value.embeds?.length),
    "a message needs content or at least one embed",
  );

// ── JSON helpers ───────────────────────────────────────────────────────────

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export const jsonObjectSchema = z.record(jsonValueSchema);

export function jsonByteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function maxJsonBytes(bytes: number, label = "payload") {
  return (value: unknown, ctx: z.RefinementCtx): void => {
    if (jsonByteSize(value) > bytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} exceeds the ${Math.floor(bytes / 1024)} KB limit`,
      });
    }
  };
}

/** Sanitizes and truncates user-facing text with a maximum length. */
export function safeTextSchema(max: number) {
  return z.string().transform((value) => truncate(sanitizeSingleLine(value, max), max, ""));
}
