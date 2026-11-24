import { headers } from "next/headers";
import type { Session } from "next-auth";
import {
  diffObjects,
  moduleSettingsSchema,
  securityConfigSchema,
  verificationConfigSchema,
  type ModuleSettingsInput,
  type SecurityConfigInput,
  type VerificationConfigInput,
} from "@nujum/shared";
import { notifyConfigChange } from "@nujum/shared/config";
import { getPrisma, Prisma } from "@nujum/shared/prisma";
import { SecurityError } from "./http";

export const AUDIT_ACTIONS = {
  security: "security.config.update",
  verification: "verification.config.update",
  module: "module.update",
} as const;

type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
type Tx = Prisma.TransactionClient;

export interface AuditContext {
  guildId: string;
  actorId: string;
  actorDiscordId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface ConfigWriteResult {
  version: number;
  changed: string[];
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  const text = JSON.stringify(value ?? null);
  return (text ? JSON.parse(text) : null) as Prisma.InputJsonValue;
}

export async function getAuditContext(guildId: string, session: Session): Promise<AuditContext> {
  const requestHeaders = await headers();
  return {
    guildId,
    actorId: session.user.id,
    actorDiscordId: session.user.discordId,
    requestId: requestHeaders.get("x-request-id") ?? undefined,
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 300) ?? undefined,
  };
}

async function record(
  tx: Tx,
  context: AuditContext,
  action: AuditAction | `${AuditAction}.revert`,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      guildId: context.guildId,
      actorId: context.actorId,
      actorType: "DASHBOARD",
      action,
      targetType,
      targetId,
      ...(reason ? { reason: reason.slice(0, 300) } : {}),
      before: toInputJson(before),
      after: toInputJson(after),
      ...(context.ip ? { ip: context.ip } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
    },
  });
}

async function commitSecurity(
  tx: Tx,
  context: AuditContext,
  input: SecurityConfigInput,
): Promise<ConfigWriteResult> {
  const before = await tx.securityConfig.findUnique({ where: { guildId: context.guildId } });
  const after = await tx.securityConfig.upsert({
    where: { guildId: context.guildId },
    create: { guildId: context.guildId, ...input, updatedBy: context.actorId },
    update: { ...input, updatedBy: context.actorId },
  });
  const changed = diffObjects(before, after).map((entry) => entry.path);
  await record(
    tx,
    context,
    AUDIT_ACTIONS.security,
    "SecurityConfig",
    context.guildId,
    before,
    after,
  );
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.security,
    changedBy: context.actorDiscordId,
  });
  return { version, changed };
}

export async function writeSecurityConfig(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = securityConfigSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid security settings.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitSecurity(tx, context, parsed.data));
}

async function commitVerification(
  tx: Tx,
  context: AuditContext,
  input: VerificationConfigInput,
): Promise<ConfigWriteResult> {
  const before = await tx.verificationConfig.findUnique({ where: { guildId: context.guildId } });
  const after = await tx.verificationConfig.upsert({
    where: { guildId: context.guildId },
    create: {
      guildId: context.guildId,
      ...input,
      embed: input.embed ? toInputJson(input.embed) : Prisma.JsonNull,
      captchaProvider: input.captchaProvider ?? null,
      updatedBy: context.actorId,
    },
    update: {
      ...input,
      embed: input.embed ? toInputJson(input.embed) : Prisma.JsonNull,
      captchaProvider: input.captchaProvider ?? null,
      updatedBy: context.actorId,
    },
  });
  const changed = diffObjects(before, after).map((entry) => entry.path);
  await record(
    tx,
    context,
    AUDIT_ACTIONS.verification,
    "VerificationConfig",
    context.guildId,
    before,
    after,
  );
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.verification,
    changedBy: context.actorDiscordId,
  });
  return { version, changed };
}

export async function writeVerificationConfig(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = verificationConfigSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid verification settings.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitVerification(tx, context, parsed.data));
}

async function commitModule(
  tx: Tx,
  context: AuditContext,
  input: ModuleSettingsInput,
): Promise<ConfigWriteResult> {
  const before = await tx.guildModule.findUnique({
    where: { guildId_key: { guildId: context.guildId, key: input.key } },
  });
  const after = await tx.guildModule.upsert({
    where: { guildId_key: { guildId: context.guildId, key: input.key } },
    create: {
      guildId: context.guildId,
      key: input.key,
      enabled: input.enabled,
      settings: toInputJson(input.settings),
      updatedBy: context.actorId,
    },
    update: {
      enabled: input.enabled,
      settings: toInputJson(input.settings),
      updatedBy: context.actorId,
    },
  });
  const changed = diffObjects(before, after).map((entry) => entry.path);
  await record(tx, context, AUDIT_ACTIONS.module, "GuildModule", input.key, before, after);
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.module,
    changedBy: context.actorDiscordId,
  });
  return { version, changed };
}

export async function writeModuleConfig(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = moduleSettingsSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid module settings.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitModule(tx, context, parsed.data));
}

const REVERTIBLE = new Set<string>(Object.values(AUDIT_ACTIONS));

/** Reverts a known config change from its stored before-image inside one transaction. */
export async function revertAuditEntry(
  context: AuditContext,
  rawAuditId: string,
): Promise<ConfigWriteResult> {
  const auditId = rawAuditId.trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(auditId)) {
    throw new SecurityError("Invalid audit entry id.", "BAD_REQUEST");
  }
  return getPrisma().$transaction(async (tx) => {
    const entry = await tx.auditLog.findFirst({
      where: { id: auditId, guildId: context.guildId },
    });
    if (!entry || !REVERTIBLE.has(entry.action) || entry.revertedAt) {
      throw new SecurityError("That change cannot be reverted.", "BAD_REQUEST");
    }
    switch (entry.action) {
      case AUDIT_ACTIONS.security: {
        const parsed = securityConfigSchema.safeParse(entry.before);
        if (!parsed.success)
          throw new SecurityError("Stored security config is invalid.", "BAD_REQUEST");
        const result = await commitSecurity(tx, context, parsed.data);
        await tx.auditLog.update({
          where: { id: entry.id },
          data: { revertedById: context.actorId, revertedAt: new Date() },
        });
        return result;
      }
      case AUDIT_ACTIONS.verification: {
        const parsed = verificationConfigSchema.safeParse(entry.before);
        if (!parsed.success) {
          throw new SecurityError("Stored verification config is invalid.", "BAD_REQUEST");
        }
        const result = await commitVerification(tx, context, parsed.data);
        await tx.auditLog.update({
          where: { id: entry.id },
          data: { revertedById: context.actorId, revertedAt: new Date() },
        });
        return result;
      }
      case AUDIT_ACTIONS.module: {
        const parsed = moduleSettingsSchema.safeParse(entry.before);
        if (!parsed.success)
          throw new SecurityError("Stored module config is invalid.", "BAD_REQUEST");
        const result = await commitModule(tx, context, parsed.data);
        await tx.auditLog.update({
          where: { id: entry.id },
          data: { revertedById: context.actorId, revertedAt: new Date() },
        });
        return result;
      }
      default:
        throw new SecurityError("That change cannot be reverted.", "BAD_REQUEST");
    }
  });
}
