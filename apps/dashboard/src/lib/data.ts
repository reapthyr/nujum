import {
  DEFAULT_MODULE_STATE,
  JTC_DEFAULTS,
  MODULES,
  TICKET_DEFAULTS,
  jtcConfigSchema,
  securityConfigSchema,
  ticketCategoryInputSchema,
  ticketConfigSchema,
  verificationConfigSchema,
  type JtcConfigInput,
  type ModuleDefinition,
  type ModuleSettingsInput,
  type SecurityConfigInput,
  type TicketCategoryInput,
  type TicketConfigInput,
  type VerificationConfigInput,
} from "@nujum/shared";
import { getPrisma } from "@nujum/shared/prisma";

const SECURITY_DEFAULTS: SecurityConfigInput = {
  antiRaidEnabled: true,
  raidJoinThreshold: 10,
  raidWindowSeconds: 30,
  raidMinAccountAgeDays: 7,
  raidAction: "LOCKDOWN",
  antiNukeEnabled: true,
  nukeThreshold: 3,
  nukeWindowSeconds: 60,
  antiSpamEnabled: true,
  spamThreshold: 7,
  spamWindowSeconds: 5,
  spamAction: "TIMEOUT",
  mentionLimit: 5,
  inviteFilterEnabled: true,
  linkFilterEnabled: true,
  phishingDetection: true,
  allowedDomains: [],
  allowedInviteCodes: [],
  alertChannelId: null,
  autoLockdown: true,
};

const VERIFICATION_DEFAULTS: VerificationConfigInput = {
  enabled: false,
  mode: "BUTTON",
  channelId: null,
  roleId: null,
  minAccountAgeDays: 7,
  message: "Click the button below to verify.",
  embed: null,
  captchaProvider: null,
};

export async function loadSecurityConfig(guildId: string): Promise<SecurityConfigInput> {
  const row = await getPrisma().securityConfig.findUnique({ where: { guildId } });
  return securityConfigSchema.parse(row ?? SECURITY_DEFAULTS);
}

export async function loadVerificationConfig(guildId: string): Promise<VerificationConfigInput> {
  const row = await getPrisma().verificationConfig.findUnique({ where: { guildId } });
  return verificationConfigSchema.parse(row ?? VERIFICATION_DEFAULTS);
}

export type { JtcConfigInput, TicketCategoryInput, TicketConfigInput } from "@nujum/shared";

export const TICKET_CONFIG_DEFAULTS: TicketConfigInput = {
  enabled: false,
  panelChannelId: null,
  transcriptChannelId: null,
  logChannelId: null,
  supportRoleIds: [],
  maxOpenPerUser: TICKET_DEFAULTS.maxOpenPerUser,
  inactivityHours: TICKET_DEFAULTS.inactivityHours,
  warnBeforeHours: TICKET_DEFAULTS.warnBeforeHours,
  namingFormat: TICKET_DEFAULTS.namingFormat,
  ratingEnabled: true,
};

export const JTC_CONFIG_DEFAULTS: JtcConfigInput = {
  enabled: false,
  generatorChannelId: null,
  categoryId: null,
  nameTemplate: JTC_DEFAULTS.nameTemplate,
  defaultLimit: JTC_DEFAULTS.defaultLimit,
  defaultBitrate: JTC_DEFAULTS.defaultBitrate,
  defaultRegion: JTC_DEFAULTS.defaultRegion,
  panelChannelId: null,
  interfaceChannelId: null,
  trustedRoleIds: [],
};

export async function loadTicketConfig(guildId: string): Promise<TicketConfigInput> {
  const row = await getPrisma().ticketConfig.findUnique({ where: { guildId } });
  const parsed = ticketConfigSchema.safeParse(row ?? TICKET_CONFIG_DEFAULTS);
  return parsed.success ? parsed.data : TICKET_CONFIG_DEFAULTS;
}

export interface TicketCategoryView extends TicketCategoryInput {
  id: string;
}

/** Invalid stored JSON never reaches the editor: the row falls back to safe defaults. */
export async function loadTicketCategories(guildId: string): Promise<TicketCategoryView[]> {
  const rows = await getPrisma().ticketCategory.findMany({
    where: { guildId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.flatMap((row): TicketCategoryView[] => {
    const candidate = { ...row, formFields: Array.isArray(row.formFields) ? row.formFields : [] };
    const parsed = ticketCategoryInputSchema.safeParse(candidate);
    if (parsed.success) return [{ id: row.id, ...parsed.data }];
    const fallback = ticketCategoryInputSchema.safeParse({
      ...candidate,
      name: "Unnamed category",
      emoji: null,
      description: null,
      discordCategoryId: null,
      supportRoleIds: [],
      formFields: [],
      position: 0,
    });
    return fallback.success ? [{ id: row.id, ...fallback.data }] : [];
  });
}

export async function loadJtcConfig(guildId: string): Promise<JtcConfigInput> {
  const row = await getPrisma().jtcConfig.findUnique({ where: { guildId } });
  const parsed = jtcConfigSchema.safeParse(row ?? JTC_CONFIG_DEFAULTS);
  return parsed.success ? parsed.data : JTC_CONFIG_DEFAULTS;
}

export interface ModuleView extends ModuleDefinition {
  enabled: boolean;
  settings: Record<string, unknown>;
}

export async function loadModules(guildId: string): Promise<ModuleView[]> {
  const rows = await getPrisma().guildModule.findMany({ where: { guildId } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return MODULES.map((definition) => {
    const row = byKey.get(definition.key);
    const settings =
      row &&
      typeof row.settings === "object" &&
      row.settings !== null &&
      !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {};
    return {
      ...definition,
      enabled: row?.enabled ?? DEFAULT_MODULE_STATE[definition.key],
      settings,
    };
  });
}

export interface ModuleFormValue {
  key: ModuleSettingsInput["key"];
  enabled: boolean;
  settings: Record<string, unknown>;
}

export function toModuleFormValue(module: ModuleView): ModuleFormValue {
  return { key: module.key, enabled: module.enabled, settings: module.settings };
}

export interface AuditView {
  id: string;
  action: string;
  actorId: string;
  actorType: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  revertedAt: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export async function loadAuditLog(guildId: string): Promise<AuditView[]> {
  const rows = await getPrisma().auditLog.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actorId,
    actorType: row.actorType,
    targetType: row.targetType,
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
    revertedAt: row.revertedAt?.toISOString() ?? null,
    before: row.before,
    after: row.after,
    reason: row.reason,
  }));
}

export interface QueueView {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  createdBy: string;
}

export async function loadQueue(guildId: string): Promise<QueueView[]> {
  const rows = await getPrisma().pendingBotAction.findMany({
    where: { guildId, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  }));
}

export async function loadOverviewStats(guildId: string) {
  const prisma = getPrisma();
  const [auditCount, queueDepth, threats, modules, openTickets, jtcRooms] = await Promise.all([
    prisma.auditLog.count({ where: { guildId } }),
    prisma.pendingBotAction.count({ where: { guildId, status: "PENDING" } }),
    prisma.threatEvent.count({ where: { guildId, resolved: false } }),
    prisma.guildModule.count({ where: { guildId, enabled: true } }),
    prisma.ticket.count({ where: { guildId, status: { in: ["OPEN", "CLAIMED"] } } }),
    prisma.jtcRoom.count({ where: { guildId, deletedAt: null } }),
  ]);
  return { auditCount, queueDepth, threats, modules, openTickets, jtcRooms };
}
