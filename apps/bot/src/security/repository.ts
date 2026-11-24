import type { WhitelistType } from "@nujum/shared";
import { Prisma, getPrisma } from "@nujum/shared/prisma";
import type {
  AuditWrite,
  LockdownRecord,
  SecurityRepository,
  SecuritySettings,
  ThreatWrite,
  WhitelistSets,
} from "./types";

function toSettings(row: {
  antiRaidEnabled: boolean;
  raidJoinThreshold: number;
  raidWindowSeconds: number;
  raidMinAccountAgeDays: number;
  raidAction: string;
  antiNukeEnabled: boolean;
  nukeThreshold: number;
  nukeWindowSeconds: number;
  antiSpamEnabled: boolean;
  spamThreshold: number;
  spamWindowSeconds: number;
  spamAction: string;
  mentionLimit: number;
  inviteFilterEnabled: boolean;
  linkFilterEnabled: boolean;
  phishingDetection: boolean;
  allowedDomains: string[];
  allowedInviteCodes: string[];
  alertChannelId: string | null;
  autoLockdown: boolean;
}): SecuritySettings {
  return {
    antiRaidEnabled: row.antiRaidEnabled,
    raidJoinThreshold: row.raidJoinThreshold,
    raidWindowSeconds: row.raidWindowSeconds,
    raidMinAccountAgeDays: row.raidMinAccountAgeDays,
    raidAction: row.raidAction as SecuritySettings["raidAction"],
    antiNukeEnabled: row.antiNukeEnabled,
    nukeThreshold: row.nukeThreshold,
    nukeWindowSeconds: row.nukeWindowSeconds,
    antiSpamEnabled: row.antiSpamEnabled,
    spamThreshold: row.spamThreshold,
    spamWindowSeconds: row.spamWindowSeconds,
    spamAction: row.spamAction as SecuritySettings["spamAction"],
    mentionLimit: row.mentionLimit,
    inviteFilterEnabled: row.inviteFilterEnabled,
    linkFilterEnabled: row.linkFilterEnabled,
    phishingDetection: row.phishingDetection,
    allowedDomains: [...row.allowedDomains],
    allowedInviteCodes: [...row.allowedInviteCodes],
    alertChannelId: row.alertChannelId,
    autoLockdown: row.autoLockdown,
  };
}

function emptyWhitelist(): {
  users: Set<string>;
  roles: Set<string>;
  channels: Set<string>;
  domains: Set<string>;
  invites: Set<string>;
} {
  return {
    users: new Set<string>(),
    roles: new Set<string>(),
    channels: new Set<string>(),
    domains: new Set<string>(),
    invites: new Set<string>(),
  };
}

/** Prisma-backed implementation used in production. */
export class PrismaSecurityRepository implements SecurityRepository {
  async loadSettings(guildId: string): Promise<SecuritySettings | null> {
    const row = await getPrisma().securityConfig.findUnique({ where: { guildId } });
    return row ? toSettings(row) : null;
  }

  async loadWhitelist(guildId: string): Promise<WhitelistSets> {
    const rows = await getPrisma().securityWhitelist.findMany({ where: { guildId } });
    const sets = emptyWhitelist();
    for (const row of rows) {
      switch (row.type) {
        case "USER":
          sets.users.add(row.value);
          break;
        case "ROLE":
          sets.roles.add(row.value);
          break;
        case "CHANNEL":
          sets.channels.add(row.value);
          break;
        case "DOMAIN":
          sets.domains.add(row.value.toLowerCase().replace(/^www\./, ""));
          break;
        case "INVITE":
          sets.invites.add(row.value.toLowerCase());
          break;
      }
    }
    return sets;
  }

  async saveSettings(
    guildId: string,
    patch: Partial<SecuritySettings>,
    updatedBy: string,
  ): Promise<void> {
    const prisma = getPrisma();
    const { allowedDomains, allowedInviteCodes, ...scalarPatch } = patch;
    const data = {
      ...scalarPatch,
      ...(allowedDomains ? { allowedDomains: [...allowedDomains] } : {}),
      ...(allowedInviteCodes ? { allowedInviteCodes: [...allowedInviteCodes] } : {}),
      updatedBy,
    };

    await prisma.$transaction([
      prisma.securityConfig.upsert({
        where: { guildId },
        create: {
          guildId,
          allowedDomains: [],
          allowedInviteCodes: [],
          ...data,
        },
        update: data,
      }),
      // Bumping the version lets other shards invalidate their cache in Phase 4.
      prisma.guild.update({
        where: { id: guildId },
        data: { configVersion: { increment: 1 } },
      }),
    ]);
  }

  async loadLockdown(guildId: string): Promise<LockdownRecord> {
    const row = await getPrisma().lockdownState.findUnique({ where: { guildId } });
    if (!row) {
      return {
        active: false,
        reason: null,
        activatedBy: null,
        activatedAt: null,
        snapshot: { channels: [] },
      };
    }

    const parsePrevious = (value: unknown): { allow: string; deny: string } | null => {
      if (typeof value !== "object" || value === null) return null;
      const record = value as { allow?: unknown; deny?: unknown };
      return typeof record.allow === "string" && typeof record.deny === "string"
        ? { allow: record.allow, deny: record.deny }
        : null;
    };

    const raw = row.snapshot as { channels?: unknown } | null;
    const channels = Array.isArray(raw?.channels)
      ? raw.channels.flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const record = entry as {
            channelId?: unknown;
            previous?: unknown;
            overwrites?: unknown;
          };
          if (typeof record.channelId !== "string") return [];
          const overwrites = Array.isArray(record.overwrites)
            ? record.overwrites.flatMap((value) => {
                if (typeof value !== "object" || value === null) return [];
                const item = value as { id?: unknown; previous?: unknown };
                return typeof item.id === "string"
                  ? [{ id: item.id, previous: parsePrevious(item.previous) }]
                  : [];
              })
            : undefined;
          return [
            {
              channelId: record.channelId,
              previous: parsePrevious(record.previous),
              ...(overwrites ? { overwrites } : {}),
            },
          ];
        })
      : [];

    return {
      active: row.active,
      reason: row.reason,
      activatedBy: row.activatedBy,
      activatedAt: row.activatedAt,
      snapshot: { channels },
    };
  }

  async saveLockdown(guildId: string, record: LockdownRecord): Promise<void> {
    const prisma = getPrisma();
    const data = {
      active: record.active,
      reason: record.reason,
      activatedBy: record.activatedBy,
      activatedAt: record.activatedAt,
      deactivatedAt: record.active ? null : new Date(),
      snapshot: record.snapshot as unknown as Prisma.InputJsonValue,
    };

    await prisma.lockdownState.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
  }

  async createThreat(threat: ThreatWrite): Promise<void> {
    await getPrisma().threatEvent.create({
      data: {
        guildId: threat.guildId,
        type: threat.type,
        severity: threat.severity,
        actorId: threat.actorId ?? null,
        channelId: threat.channelId ?? null,
        messageId: threat.messageId ?? null,
        details: {
          ...(threat.details ?? {}),
          ...(threat.reason ? { reason: threat.reason } : {}),
        },
        actionTaken: threat.actionTaken ?? null,
      },
    });
  }

  async createAudit(entry: AuditWrite): Promise<void> {
    await getPrisma().auditLog.create({
      data: {
        guildId: entry.guildId,
        actorId: entry.actorId,
        actorType: entry.actorType,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        reason: entry.reason ?? null,
        before:
          entry.before === undefined
            ? Prisma.DbNull
            : (entry.before as unknown as Prisma.InputJsonValue),
        after:
          entry.after === undefined
            ? Prisma.DbNull
            : (entry.after as unknown as Prisma.InputJsonValue),
        requestId: entry.requestId ?? null,
      },
    });
  }

  async addWhitelist(
    guildId: string,
    type: WhitelistType,
    value: string,
    actorId: string,
  ): Promise<void> {
    await getPrisma().securityWhitelist.upsert({
      where: { guildId_type_value: { guildId, type, value } },
      create: { guildId, type, value, createdBy: actorId },
      update: {},
    });
  }

  async removeWhitelist(guildId: string, type: WhitelistType, value: string): Promise<void> {
    await getPrisma().securityWhitelist.deleteMany({ where: { guildId, type, value } });
  }
}
