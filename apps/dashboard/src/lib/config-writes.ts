import { headers } from "next/headers";
import type { Session } from "next-auth";
import {
  AUDIT_ACTIONS as SHARED_AUDIT_ACTIONS,
  diffObjects,
  jtcConfigSchema,
  moduleSettingsSchema,
  securityConfigSchema,
  ticketCategoryCreateInputSchema,
  ticketCategoryDeleteInputSchema,
  ticketCategoryUpdateInputSchema,
  ticketConfigSchema,
  verificationConfigSchema,
  type ModuleSettingsInput,
  type SecurityConfigInput,
  type VerificationConfigInput,
} from "@nujum/shared";
import { notifyConfigChange } from "@nujum/shared/config";
import { getPrisma, Prisma } from "@nujum/shared/prisma";
import {
  JTC_CONFIG_DEFAULTS,
  TICKET_CONFIG_DEFAULTS,
  type JtcConfigInput,
  type TicketCategoryInput,
  type TicketConfigInput,
} from "./data";
import { SecurityError } from "./http";

export const AUDIT_ACTIONS = {
  security: SHARED_AUDIT_ACTIONS.securityUpdate,
  verification: SHARED_AUDIT_ACTIONS.verificationUpdate,
  module: "module.update",
  ticket: SHARED_AUDIT_ACTIONS.ticketConfigUpdate,
  ticketCategoryCreate: SHARED_AUDIT_ACTIONS.ticketCategoryCreate,
  ticketCategoryUpdate: SHARED_AUDIT_ACTIONS.ticketCategoryUpdate,
  ticketCategoryDelete: SHARED_AUDIT_ACTIONS.ticketCategoryDelete,
  jtc: SHARED_AUDIT_ACTIONS.jtcUpdate,
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
  /** Present for category writes so the client can track the affected row. */
  id?: string;
}

type TicketCategoryUpdateInput = ReturnType<typeof ticketCategoryUpdateInputSchema.parse>;

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

function ticketWriteData(input: TicketConfigInput) {
  return {
    enabled: input.enabled,
    panelChannelId: input.panelChannelId ?? null,
    transcriptChannelId: input.transcriptChannelId ?? null,
    logChannelId: input.logChannelId ?? null,
    supportRoleIds: input.supportRoleIds,
    maxOpenPerUser: input.maxOpenPerUser,
    inactivityHours: input.inactivityHours,
    warnBeforeHours: input.warnBeforeHours,
    namingFormat: input.namingFormat,
    ratingEnabled: input.ratingEnabled,
  };
}

function jtcWriteData(input: JtcConfigInput) {
  return {
    enabled: input.enabled,
    generatorChannelId: input.generatorChannelId ?? null,
    categoryId: input.categoryId ?? null,
    nameTemplate: input.nameTemplate,
    defaultLimit: input.defaultLimit,
    defaultBitrate: input.defaultBitrate,
    defaultRegion: input.defaultRegion ?? null,
    panelChannelId: input.panelChannelId ?? null,
    interfaceChannelId: input.interfaceChannelId ?? null,
    trustedRoleIds: input.trustedRoleIds,
  };
}

function categoryWriteData(input: TicketCategoryInput) {
  return {
    name: input.name,
    emoji: input.emoji ?? null,
    description: input.description ?? null,
    discordCategoryId: input.discordCategoryId ?? null,
    supportRoleIds: input.supportRoleIds,
    formFields: toInputJson(input.formFields),
    position: input.position,
    enabled: input.enabled,
  };
}

async function commitTicket(
  tx: Tx,
  context: AuditContext,
  input: TicketConfigInput,
): Promise<ConfigWriteResult> {
  const before = await tx.ticketConfig.findUnique({ where: { guildId: context.guildId } });
  const data = ticketWriteData(input);
  const after = await tx.ticketConfig.upsert({
    where: { guildId: context.guildId },
    create: { guildId: context.guildId, ...data, updatedBy: context.actorId },
    update: { ...data, updatedBy: context.actorId },
  });
  const changed = diffObjects(before, after).map((entry) => entry.path);
  await record(tx, context, AUDIT_ACTIONS.ticket, "TicketConfig", context.guildId, before, after);
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.ticket,
    changedBy: context.actorDiscordId,
  });
  return { version, changed };
}

export async function writeTicketConfig(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = ticketConfigSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid ticket settings.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitTicket(tx, context, parsed.data));
}

async function commitJtc(
  tx: Tx,
  context: AuditContext,
  input: JtcConfigInput,
): Promise<ConfigWriteResult> {
  const before = await tx.jtcConfig.findUnique({ where: { guildId: context.guildId } });
  const data = jtcWriteData(input);
  const after = await tx.jtcConfig.upsert({
    where: { guildId: context.guildId },
    create: { guildId: context.guildId, ...data, updatedBy: context.actorId },
    update: { ...data, updatedBy: context.actorId },
  });
  const changed = diffObjects(before, after).map((entry) => entry.path);
  await record(tx, context, AUDIT_ACTIONS.jtc, "JtcConfig", context.guildId, before, after);
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.jtc,
    changedBy: context.actorDiscordId,
  });
  return { version, changed };
}

export async function writeJtcConfig(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = jtcConfigSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid join-to-create settings.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitJtc(tx, context, parsed.data));
}

async function commitCategoryCreate(
  tx: Tx,
  context: AuditContext,
  input: TicketCategoryInput,
): Promise<ConfigWriteResult> {
  const after = await tx.ticketCategory.create({
    data: { guildId: context.guildId, ...categoryWriteData(input) },
  });
  const changed = diffObjects(null, after).map((entry) => entry.path);
  await record(
    tx,
    context,
    AUDIT_ACTIONS.ticketCategoryCreate,
    "TicketCategory",
    after.id,
    null,
    after,
  );
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.ticketCategoryCreate,
    changedBy: context.actorDiscordId,
  });
  return { version, changed, id: after.id };
}

export async function createTicketCategory(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = ticketCategoryCreateInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid ticket category.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitCategoryCreate(tx, context, parsed.data));
}

async function commitCategoryUpdate(
  tx: Tx,
  context: AuditContext,
  input: TicketCategoryUpdateInput,
  allowMissing = false,
): Promise<ConfigWriteResult> {
  const before = await tx.ticketCategory.findFirst({
    where: { id: input.id, guildId: context.guildId },
  });
  if (!before && !allowMissing)
    throw new SecurityError("Ticket category not found.", "BAD_REQUEST");
  const data = categoryWriteData(input);
  const after = before
    ? await tx.ticketCategory.update({ where: { id: input.id }, data })
    : await tx.ticketCategory.create({
        data: { id: input.id, guildId: context.guildId, ...data },
      });
  const changed = diffObjects(before, after).map((entry) => entry.path);
  await record(
    tx,
    context,
    AUDIT_ACTIONS.ticketCategoryUpdate,
    "TicketCategory",
    input.id,
    before,
    after,
  );
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action: AUDIT_ACTIONS.ticketCategoryUpdate,
    changedBy: context.actorDiscordId,
  });
  return { version, changed, id: after.id };
}

export async function updateTicketCategory(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = ticketCategoryUpdateInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid ticket category.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitCategoryUpdate(tx, context, parsed.data));
}

async function commitCategoryDelete(
  tx: Tx,
  context: AuditContext,
  id: string,
  action: AuditAction | `${AuditAction}.revert` = AUDIT_ACTIONS.ticketCategoryDelete,
): Promise<ConfigWriteResult> {
  const before = await tx.ticketCategory.findFirst({
    where: { id, guildId: context.guildId },
  });
  if (!before) throw new SecurityError("Ticket category not found.", "BAD_REQUEST");
  await tx.ticketCategory.delete({ where: { id } });
  const changed = diffObjects(before, null).map((entry) => entry.path);
  await record(tx, context, action, "TicketCategory", id, before, null);
  const version = await notifyConfigChange(tx, {
    guildId: context.guildId,
    source: "DASHBOARD",
    action,
    changedBy: context.actorDiscordId,
  });
  return { version, changed, id };
}

export async function deleteTicketCategory(
  context: AuditContext,
  rawInput: unknown,
): Promise<ConfigWriteResult> {
  const parsed = ticketCategoryDeleteInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new SecurityError("Invalid ticket category id.", "BAD_REQUEST");
  return getPrisma().$transaction((tx) => commitCategoryDelete(tx, context, parsed.data.id));
}

const REVERTIBLE = new Set<string>(Object.values(AUDIT_ACTIONS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function markReverted(tx: Tx, context: AuditContext, auditId: string): Promise<void> {
  await tx.auditLog.update({
    where: { id: auditId },
    data: { revertedById: context.actorId, revertedAt: new Date() },
  });
}

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
    if (
      !entry ||
      entry.guildId !== context.guildId ||
      !REVERTIBLE.has(entry.action) ||
      entry.revertedAt
    ) {
      throw new SecurityError("That change cannot be reverted.", "BAD_REQUEST");
    }
    switch (entry.action) {
      case AUDIT_ACTIONS.security: {
        const parsed = securityConfigSchema.safeParse(entry.before);
        if (!parsed.success)
          throw new SecurityError("Stored security config is invalid.", "BAD_REQUEST");
        const result = await commitSecurity(tx, context, parsed.data);
        await markReverted(tx, context, entry.id);
        return result;
      }
      case AUDIT_ACTIONS.verification: {
        const parsed = verificationConfigSchema.safeParse(entry.before);
        if (!parsed.success) {
          throw new SecurityError("Stored verification config is invalid.", "BAD_REQUEST");
        }
        const result = await commitVerification(tx, context, parsed.data);
        await markReverted(tx, context, entry.id);
        return result;
      }
      case AUDIT_ACTIONS.module: {
        const parsed = moduleSettingsSchema.safeParse(entry.before);
        if (!parsed.success)
          throw new SecurityError("Stored module config is invalid.", "BAD_REQUEST");
        const result = await commitModule(tx, context, parsed.data);
        await markReverted(tx, context, entry.id);
        return result;
      }
      case AUDIT_ACTIONS.ticket: {
        const parsed = ticketConfigSchema.safeParse(entry.before ?? TICKET_CONFIG_DEFAULTS);
        if (!parsed.success)
          throw new SecurityError("Stored ticket config is invalid.", "BAD_REQUEST");
        const result = await commitTicket(tx, context, parsed.data);
        await markReverted(tx, context, entry.id);
        return result;
      }
      case AUDIT_ACTIONS.jtc: {
        const parsed = jtcConfigSchema.safeParse(entry.before ?? JTC_CONFIG_DEFAULTS);
        if (!parsed.success)
          throw new SecurityError("Stored join-to-create config is invalid.", "BAD_REQUEST");
        const result = await commitJtc(tx, context, parsed.data);
        await markReverted(tx, context, entry.id);
        return result;
      }
      case AUDIT_ACTIONS.ticketCategoryUpdate:
      case AUDIT_ACTIONS.ticketCategoryDelete: {
        const id = entry.targetId;
        const parsed = ticketCategoryUpdateInputSchema.safeParse({
          ...(isRecord(entry.before) ? entry.before : {}),
          ...(id ? { id } : {}),
        });
        if (!parsed.success || !id)
          throw new SecurityError("Stored ticket category is invalid.", "BAD_REQUEST");
        const result = await commitCategoryUpdate(tx, context, parsed.data, true);
        await markReverted(tx, context, entry.id);
        return result;
      }
      case AUDIT_ACTIONS.ticketCategoryCreate: {
        // The full created row is stored in `after`; its id is what revert removes.
        const created = isRecord(entry.after) ? entry.after : null;
        const id = typeof created?.id === "string" ? created.id : null;
        if (!id || !ticketCategoryDeleteInputSchema.safeParse({ id }).success)
          throw new SecurityError("Stored ticket category is invalid.", "BAD_REQUEST");
        const result = await commitCategoryDelete(
          tx,
          context,
          id,
          `${AUDIT_ACTIONS.ticketCategoryCreate}.revert`,
        );
        await markReverted(tx, context, entry.id);
        return result;
      }
      default:
        throw new SecurityError("That change cannot be reverted.", "BAD_REQUEST");
    }
  });
}
