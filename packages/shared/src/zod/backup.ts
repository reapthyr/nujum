import { z } from "zod";
import { BACKUP_MAX_BYTES, BACKUP_TYPES } from "../constants";
import { confirmSchema, jsonObjectSchema, maxJsonBytes, reasonSchema, zEnum } from "./common";

export const backupCreateSchema = z.object({
  type: zEnum(BACKUP_TYPES),
});

export const configImportSchema = z
  .object({
    data: jsonObjectSchema,
    mode: zEnum(["merge", "replace"] as const),
    confirm: confirmSchema,
  })
  .superRefine(maxJsonBytes(BACKUP_MAX_BYTES, "config import"));

export const configResetSchema = z.object({
  confirm: confirmSchema,
  reason: reasonSchema,
});

export const backupRestoreSchema = z.object({
  backupId: z.string().min(1).max(64),
  confirm: confirmSchema,
});
