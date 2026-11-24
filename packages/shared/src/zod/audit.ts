import { z } from "zod";
import {
  cuidSchema,
  dateRangeFields,
  paginationSchema,
  reasonSchema,
  snowflakeSchema,
  withValidDateRange,
} from "./common";

export const auditQuerySchema = withValidDateRange(
  paginationSchema.extend({
    ...dateRangeFields,
    guildId: snowflakeSchema.optional(),
    actorId: snowflakeSchema.optional(),
    action: z.string().max(100).optional(),
    targetId: z.string().max(64).optional(),
  }),
);

export const revertAuditSchema = z.object({
  auditId: cuidSchema,
  reason: reasonSchema,
});
