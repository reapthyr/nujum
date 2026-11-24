import type { Punishment, ThreatType, WhitelistType } from "@nujum/shared";

/**
 * Runtime shape of a guild's security configuration. Mirrors the Prisma
 * `SecurityConfig` model; kept structural so the detectors have no Prisma
 * dependency and can be unit-tested with plain objects.
 */
export interface SecuritySettings {
  antiRaidEnabled: boolean;
  raidJoinThreshold: number;
  raidWindowSeconds: number;
  raidMinAccountAgeDays: number;
  raidAction: Punishment;

  antiNukeEnabled: boolean;
  nukeThreshold: number;
  nukeWindowSeconds: number;

  antiSpamEnabled: boolean;
  spamThreshold: number;
  spamWindowSeconds: number;
  spamAction: Punishment;
  mentionLimit: number;

  inviteFilterEnabled: boolean;
  linkFilterEnabled: boolean;
  phishingDetection: boolean;
  allowedDomains: readonly string[];
  allowedInviteCodes: readonly string[];

  alertChannelId: string | null;
  autoLockdown: boolean;
}

/** Matches the defaults declared in `schema.prisma`. */
export const DEFAULT_SECURITY_SETTINGS: Readonly<SecuritySettings> = Object.freeze({
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
});

export interface WhitelistSets {
  users: ReadonlySet<string>;
  roles: ReadonlySet<string>;
  channels: ReadonlySet<string>;
  domains: ReadonlySet<string>;
  invites: ReadonlySet<string>;
}

export const EMPTY_WHITELIST: WhitelistSets = Object.freeze({
  users: new Set<string>(),
  roles: new Set<string>(),
  channels: new Set<string>(),
  domains: new Set<string>(),
  invites: new Set<string>(),
});

export interface SecuritySnapshot {
  settings: SecuritySettings;
  whitelist: WhitelistSets;
  /** True when the values came from the database rather than the built-in defaults. */
  persisted: boolean;
}

export interface ThreatRecord {
  type: ThreatType;
  /** 1 = informational, 2 = action taken, 3 = destructive. */
  severity: 1 | 2 | 3;
  /** Human-readable explanation shown in alerts (never stored as raw content). */
  reason?: string | null;
  actorId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  details?: Record<string, unknown>;
  actionTaken?: string | null;
}

export interface ThreatWrite extends ThreatRecord {
  guildId: string;
}

export interface AuditWrite {
  guildId: string;
  actorId: string;
  actorType: "USER" | "DASHBOARD" | "BOT" | "SYSTEM";
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}

export interface LockdownOverwrite {
  /** Role or member id whose overwrite was replaced. */
  id: string;
  /** Serialized permission overwrite that existed before lockdown, if any. */
  previous: { allow: string; deny: string } | null;
}

export interface LockdownSnapshotChannel {
  channelId: string;
  /** Legacy `@everyone` overwrite; also mirrored in `overwrites`. */
  previous: LockdownOverwrite["previous"];
  /** Every overwrite that could grant a locked permission, restored on unlock. */
  overwrites?: LockdownOverwrite[];
}

export interface LockdownSnapshot {
  channels: LockdownSnapshotChannel[];
}

export interface LockdownRecord {
  active: boolean;
  reason: string | null;
  activatedBy: string | null;
  activatedAt: Date | null;
  snapshot: LockdownSnapshot;
}

export interface SecurityRepository {
  loadSettings(guildId: string): Promise<SecuritySettings | null>;
  loadWhitelist(guildId: string): Promise<WhitelistSets>;
  saveSettings(guildId: string, patch: Partial<SecuritySettings>, updatedBy: string): Promise<void>;
  loadLockdown(guildId: string): Promise<LockdownRecord>;
  saveLockdown(guildId: string, record: LockdownRecord): Promise<void>;
  createThreat(threat: ThreatWrite): Promise<void>;
  createAudit(entry: AuditWrite): Promise<void>;
  addWhitelist(guildId: string, type: WhitelistType, value: string, actorId: string): Promise<void>;
  removeWhitelist(guildId: string, type: WhitelistType, value: string): Promise<void>;
}
