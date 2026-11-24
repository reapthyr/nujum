/**
 * Brand, limits and enum mirrors used by both deployables.
 *
 * These arrays intentionally mirror the Prisma enums instead of importing the
 * generated client, so that browser bundles never pull in Prisma. A unit test
 * (`enums.test.ts`) asserts parity with the generated client at build time.
 */

export const BRAND = {
  name: "Nujum",
  tagline: "Your server, written in the stars.",
  description:
    "Nujum is an all-in-one Discord bot for moderation, tickets, security and community — controlled from a premium web dashboard.",
  colors: {
    midnight: 0x070b1a,
    deepSpace: 0x0d1226,
    nebula: 0x8b5cf6,
    nebulaSoft: 0xa78bfa,
    star: 0xf5c451,
    aurora: 0x22d3ee,
    success: 0x22c55e,
    warning: 0xf59e0b,
    danger: 0xef4444,
    muted: 0x94a3b8,
  },
  defaultColor: 0x8b5cf6,
  website: "https://nujum.app",
  supportServer: "https://discord.gg/nujum",
  docs: "https://nujum.app/docs",
} as const;

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const DEFAULT_TIMEZONE = "UTC";

export const MODULE_KEYS = [
  "TICKETS",
  "JTC",
  "WELCOME",
  "VERIFICATION",
  "MODERATION",
  "LOGGING",
  "SECURITY",
  "LEVELING",
  "GIVEAWAYS",
  "SUGGESTIONS",
  "POLLS",
  "STARBOARD",
  "REMINDERS",
  "AFK",
  "BIRTHDAYS",
  "TEMPROLES",
  "STATCHANNELS",
  "ANNOUNCEMENTS",
  "AUTOMOD",
  "FAQ",
  "EMBEDBUILDER",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const ACTOR_TYPES = ["USER", "DASHBOARD", "BOT", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const CASE_TYPES = [
  "BAN",
  "KICK",
  "TIMEOUT",
  "WARN",
  "SOFTBAN",
  "UNBAN",
  "UNMUTE",
  "PURGE",
  "SLOWMODE",
  "LOCK",
  "UNLOCK",
  "NICK",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = ["ACTIVE", "EXPIRED", "REVOKED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PUNISHMENTS = [
  "NONE",
  "DELETE",
  "WARN",
  "TIMEOUT",
  "KICK",
  "BAN",
  "LOCKDOWN",
] as const;
export type Punishment = (typeof PUNISHMENTS)[number];

export const THREAT_TYPES = [
  "MASS_JOIN",
  "RAID",
  "SPAM",
  "FLOOD",
  "MASS_MENTION",
  "INVITE",
  "LINK",
  "PHISHING",
  "MASS_CHANNEL_DELETE",
  "MASS_ROLE_DELETE",
  "MASS_BAN",
  "MASS_KICK",
  "WEBHOOK_CREATE",
  "PERMISSION_ESCALATION",
] as const;
export type ThreatType = (typeof THREAT_TYPES)[number];

export const WHITELIST_TYPES = ["USER", "ROLE", "CHANNEL", "DOMAIN", "INVITE"] as const;
export type WhitelistType = (typeof WHITELIST_TYPES)[number];

export const IGNORE_TYPES = ["CHANNEL", "ROLE", "USER"] as const;
export type IgnoreType = (typeof IGNORE_TYPES)[number];

export const TICKET_STATUSES = ["OPEN", "CLAIMED", "CLOSED", "DELETED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const PANEL_TYPES = ["BUTTONS", "DROPDOWN"] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

export const APPEAL_STATUSES = ["PENDING", "APPROVED", "DENIED"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const VERIFICATION_MODES = ["BUTTON", "CAPTCHA", "ACCOUNT_AGE"] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];

export const AUTO_ROLE_TRIGGERS = ["JOIN", "BOT", "VERIFIED"] as const;
export type AutoRoleTrigger = (typeof AUTO_ROLE_TRIGGERS)[number];

export const ROLE_PANEL_MODES = ["TOGGLE", "UNIQUE", "MULTI"] as const;
export type RolePanelMode = (typeof ROLE_PANEL_MODES)[number];

export const LOG_EVENTS = [
  "MESSAGE_EDIT",
  "MESSAGE_DELETE",
  "MESSAGE_BULK_DELETE",
  "MEMBER_JOIN",
  "MEMBER_LEAVE",
  "MEMBER_NICK",
  "MEMBER_ROLE_ADD",
  "MEMBER_ROLE_REMOVE",
  "MEMBER_BAN",
  "MEMBER_UNBAN",
  "MEMBER_TIMEOUT",
  "CHANNEL_CREATE",
  "CHANNEL_DELETE",
  "CHANNEL_UPDATE",
  "ROLE_CREATE",
  "ROLE_DELETE",
  "ROLE_UPDATE",
  "VOICE_JOIN",
  "VOICE_LEAVE",
  "VOICE_MOVE",
  "INVITE_CREATE",
  "INVITE_DELETE",
  "THREAD_CREATE",
  "THREAD_DELETE",
  "WEBHOOK_UPDATE",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export const KEYWORD_MATCH_TYPES = ["EXACT", "CONTAINS", "REGEX"] as const;
export type KeywordMatchType = (typeof KEYWORD_MATCH_TYPES)[number];

export const GIVEAWAY_STATUSES = ["SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

export const SUGGESTION_STATUSES = ["OPEN", "ACCEPTED", "DENIED", "IMPLEMENTED"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const POLL_STATUSES = ["OPEN", "CLOSED"] as const;
export type PollStatus = (typeof POLL_STATUSES)[number];

export const SCHEDULED_ACTION_TYPES = [
  "TEMPBAN",
  "TEMPMUTE",
  "TEMPROLE",
  "REMINDER",
  "GIVEAWAY_END",
  "POLL_END",
  "ANNOUNCEMENT",
  "TICKET_AUTOCLOSE",
  "TICKET_WARN",
  "VERIFICATION_EXPIRE",
] as const;
export type ScheduledActionType = (typeof SCHEDULED_ACTION_TYPES)[number];

export const BACKUP_TYPES = ["CONFIG", "STRUCTURE"] as const;
export type BackupType = (typeof BACKUP_TYPES)[number];

export const BLACKLIST_TYPES = ["USER", "GUILD", "DOMAIN"] as const;
export type BlacklistType = (typeof BLACKLIST_TYPES)[number];

export const STAT_CHANNEL_TYPES = ["MEMBERS", "ONLINE", "BOOSTS"] as const;
export type StatChannelType = (typeof STAT_CHANNEL_TYPES)[number];

export const PRESENCE_STATUSES = ["online", "idle", "dnd", "invisible"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** PostgreSQL LISTEN/NOTIFY channel for config hot-reload. */
export const CONFIG_NOTIFY_CHANNEL = "nujum_config";
/** Fallback polling interval when LISTEN is unavailable. */
export const CONFIG_POLL_INTERVAL_MS = 10_000;
/** Config cache TTL guard, independent of notifications. */
export const CONFIG_CACHE_TTL_MS = 30_000;

export const HMAC_CONSTANTS = {
  headerKeyId: "x-nujum-key-id",
  headerTimestamp: "x-nujum-timestamp",
  headerNonce: "x-nujum-nonce",
  headerSignature: "x-nujum-signature",
  windowMs: 60_000,
  nonceTtlMs: 5 * 60_000,
  maxNonceEntries: 10_000,
  defaultKeyId: "dashboard",
  secretMinLength: 32,
} as const;

export const BOT_API_PREFIX = "/v1";

export const RATE_LIMIT_DEFAULTS = {
  apiPerKey: { capacity: 120, refillPerSecond: 2 },
  apiExpensive: { capacity: 5, refillPerSecond: 5 / 60 },
  apiStandard: { capacity: 30, refillPerSecond: 0.5 },
  commandDefault: { capacity: 3, refillPerSecond: 0.3 },
  commandModeration: { capacity: 5, refillPerSecond: 0.2 },
  component: { capacity: 5, refillPerSecond: 0.5 },
} as const;

export const PAGINATION = {
  defaultLimit: 25,
  maxLimit: 100,
  maxCursorLength: 64,
} as const;

export const TICKET_DEFAULTS = {
  maxOpenPerUser: 1,
  inactivityHours: 48,
  warnBeforeHours: 6,
  namingFormat: "ticket-{number}",
  maxCategories: 25,
  maxFormFields: 10,
  maxSupportRoles: 20,
  transcriptMaxBytes: 2_000_000,
} as const;

export const MODERATION_DEFAULTS = {
  warnExpiryDays: 90,
  maxPurge: 1000,
  maxReasonLength: 1000,
  maxEscalationRules: 20,
} as const;

export const LEVELING_DEFAULTS = {
  xpMin: 15,
  xpMax: 25,
  cooldownSeconds: 60,
  maxLevel: 500,
} as const;

export const BACKUP_MAX_BYTES = 2_000_000;

export const SESSION_POLICY = {
  /** Absolute session lifetime (seconds). */
  maxAgeSeconds: 8 * 60 * 60,
  /** Session token rotation interval (seconds). */
  updateAgeSeconds: 15 * 60,
  /** Dangerous actions require a session re-authenticated within this window. */
  reauthWindowSeconds: 15 * 60,
} as const;

export const OWNER_ENV = {
  ownerIds: "OWNER_IDS",
  maintenanceKey: "maintenance",
} as const;

export const AUDIT_ACTIONS = {
  guildUpdate: "guild.update",
  moduleToggle: "module.toggle",
  securityUpdate: "security.config.update",
  moderationUpdate: "moderation.config.update",
  ticketConfigUpdate: "tickets.config.update",
  ticketCategoryCreate: "tickets.category.create",
  ticketCategoryUpdate: "tickets.category.update",
  ticketCategoryDelete: "tickets.category.delete",
  ticketPanelPublish: "tickets.panel.publish",
  jtcUpdate: "jtc.config.update",
  welcomeUpdate: "welcome.config.update",
  verificationUpdate: "verification.config.update",
  rolePanelCreate: "roles.panel.create",
  rolePanelUpdate: "roles.panel.update",
  rolePanelPublish: "roles.panel.publish",
  rolePanelDelete: "roles.panel.delete",
  loggingUpdate: "logging.config.update",
  levelingUpdate: "leveling.config.update",
  giveawayCreate: "giveaways.create",
  giveawayEnd: "giveaways.end",
  suggestionUpdate: "suggestions.update",
  starboardUpdate: "starboard.config.update",
  embedSend: "embed.send",
  announcementSend: "announcement.send",
  lockdown: "security.lockdown",
  configRevert: "config.revert",
  configImport: "config.import",
  configReset: "config.reset",
  backupCreate: "backup.create",
  backupRestore: "backup.restore",
  moderationAction: "moderation.action",
  caseRevoke: "moderation.case.revoke",
  appealDecision: "moderation.appeal.decide",
  adminBroadcast: "admin.broadcast",
  adminMaintenance: "admin.maintenance",
  adminPresence: "admin.presence",
  adminFeatureFlag: "admin.feature_flag",
  adminBlacklist: "admin.blacklist",
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
