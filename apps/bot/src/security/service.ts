import type { WhitelistType } from "@nujum/shared";
import type { BotLogger } from "../lib/logger";
import { serializeError } from "../lib/errors";
import {
  DEFAULT_SECURITY_SETTINGS,
  EMPTY_WHITELIST,
  type AuditWrite,
  type LockdownRecord,
  type SecurityRepository,
  type SecuritySettings,
  type SecuritySnapshot,
  type ThreatWrite,
  type WhitelistSets,
} from "./types";

interface CacheEntry {
  snapshot: SecuritySnapshot;
  expiresAt: number;
}

export interface SecurityServiceOptions {
  ttlMs?: number;
  failureTtlMs?: number;
  maxGuilds?: number;
  now?: () => number;
}

/**
 * Per-guild security configuration cache.
 *
 * - Hits are served from memory; misses load settings + whitelist together.
 * - Concurrent misses for the same guild share one query.
 * - A database outage falls back to safe defaults and is retried quickly; it
 *   never blocks or crashes an event handler.
 * - `invalidate` is the hook Phase 4 calls from `pg_notify`.
 */
export class GuildSecurityService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<SecuritySnapshot>>();
  private readonly ttlMs: number;
  private readonly failureTtlMs: number;
  private readonly maxGuilds: number;
  private readonly now: () => number;

  constructor(
    private readonly repository: SecurityRepository,
    private readonly logger: BotLogger,
    options: SecurityServiceOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.failureTtlMs = options.failureTtlMs ?? 5_000;
    this.maxGuilds = options.maxGuilds ?? 5_000;
    this.now = options.now ?? (() => Date.now());
  }

  async snapshot(guildId: string): Promise<SecuritySnapshot> {
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > this.now()) {
      // Refresh LRU position.
      this.cache.delete(guildId);
      this.cache.set(guildId, cached);
      return cached.snapshot;
    }

    const pending = this.inflight.get(guildId);
    if (pending) return pending;

    const promise = this.load(guildId).finally(() => this.inflight.delete(guildId));
    this.inflight.set(guildId, promise);
    return promise;
  }

  async settings(guildId: string): Promise<SecuritySettings> {
    return (await this.snapshot(guildId)).settings;
  }

  async whitelist(guildId: string): Promise<WhitelistSets> {
    return (await this.snapshot(guildId)).whitelist;
  }

  invalidate(guildId?: string): void {
    if (guildId === undefined) this.cache.clear();
    else this.cache.delete(guildId);
  }

  async updateSettings(
    guildId: string,
    patch: Partial<SecuritySettings>,
    actorId: string,
  ): Promise<SecuritySettings> {
    const before = await this.settings(guildId);
    await this.repository.saveSettings(guildId, patch, actorId);
    this.invalidate(guildId);
    const after = await this.settings(guildId);

    await this.audit({
      guildId,
      actorId,
      actorType: "USER",
      action: "security.update",
      targetType: "SecurityConfig",
      targetId: guildId,
      before,
      after,
    });
    return after;
  }

  async addWhitelist(
    guildId: string,
    type: WhitelistType,
    value: string,
    actorId: string,
  ): Promise<void> {
    await this.repository.addWhitelist(guildId, type, value, actorId);
    this.invalidate(guildId);
    await this.audit({
      guildId,
      actorId,
      actorType: "USER",
      action: "security.whitelist.add",
      targetType: "SecurityWhitelist",
      targetId: value,
      after: { type, value },
    });
  }

  async removeWhitelist(
    guildId: string,
    type: WhitelistType,
    value: string,
    actorId: string,
  ): Promise<void> {
    await this.repository.removeWhitelist(guildId, type, value);
    this.invalidate(guildId);
    await this.audit({
      guildId,
      actorId,
      actorType: "USER",
      action: "security.whitelist.remove",
      targetType: "SecurityWhitelist",
      targetId: value,
      before: { type, value },
    });
  }

  async recordThreat(threat: ThreatWrite): Promise<void> {
    try {
      await this.repository.createThreat(threat);
    } catch (error) {
      this.logger.error(
        { err: serializeError(error), guildId: threat.guildId, type: threat.type },
        "failed to persist threat event",
      );
    }
  }

  async audit(entry: AuditWrite): Promise<void> {
    try {
      await this.repository.createAudit(entry);
    } catch (error) {
      this.logger.error(
        { err: serializeError(error), guildId: entry.guildId, action: entry.action },
        "failed to persist audit log",
      );
    }
  }

  async lockdown(guildId: string): Promise<LockdownRecord> {
    try {
      return await this.repository.loadLockdown(guildId);
    } catch (error) {
      this.logger.error({ err: serializeError(error), guildId }, "failed to load lockdown state");
      return {
        active: false,
        reason: null,
        activatedBy: null,
        activatedAt: null,
        snapshot: { channels: [] },
      };
    }
  }

  async saveLockdown(guildId: string, record: LockdownRecord): Promise<void> {
    await this.repository.saveLockdown(guildId, record);
  }

  private async load(guildId: string): Promise<SecuritySnapshot> {
    try {
      const [settings, whitelist] = await Promise.all([
        this.repository.loadSettings(guildId),
        this.repository.loadWhitelist(guildId),
      ]);
      const snapshot: SecuritySnapshot = {
        settings: settings ?? { ...DEFAULT_SECURITY_SETTINGS },
        whitelist: whitelist ?? EMPTY_WHITELIST,
        persisted: settings !== null,
      };
      this.store(guildId, snapshot, this.ttlMs);
      return snapshot;
    } catch (error) {
      this.logger.warn(
        { err: serializeError(error), guildId },
        "security config unavailable; using safe defaults",
      );
      const snapshot: SecuritySnapshot = {
        settings: { ...DEFAULT_SECURITY_SETTINGS },
        whitelist: EMPTY_WHITELIST,
        persisted: false,
      };
      this.store(guildId, snapshot, this.failureTtlMs);
      return snapshot;
    }
  }

  private store(guildId: string, snapshot: SecuritySnapshot, ttlMs: number): void {
    this.cache.delete(guildId);
    this.cache.set(guildId, { snapshot, expiresAt: this.now() + ttlMs });
    while (this.cache.size > this.maxGuilds) {
      const oldest = this.cache.keys().next();
      if (oldest.done) return;
      this.cache.delete(oldest.value);
    }
  }
}
