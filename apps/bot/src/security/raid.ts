import type { SecuritySettings } from "./types";

const DAY_MS = 86_400_000;

export interface JoinSignal {
  userId: string;
  /** Discord account creation timestamp in ms. */
  accountCreatedAt: number;
  now: number;
}

export interface RaidVerdict {
  triggered: boolean;
  /** Joins inside the configured window, including this one. */
  joins: number;
  /** Joins inside the window from accounts younger than the threshold. */
  youngAccounts: number;
  youngAccountIds: string[];
  windowMs: number;
  reason: string | null;
}

interface JoinRecord {
  userId: string;
  at: number;
  young: boolean;
}

/**
 * Mass-join detector.
 *
 * An individual young account is only a signal: the bot records it and alerts,
 * but does not punish it. Punishment happens when the join rate crosses the
 * threshold, which is what distinguishes a raid from a few new members.
 */
export class RaidDetector {
  private readonly joins = new Map<string, JoinRecord[]>();

  constructor(private readonly maxGuilds = 10_000) {}

  record(guildId: string, signal: JoinSignal, settings: SecuritySettings): RaidVerdict {
    const windowMs = settings.raidWindowSeconds * 1000;
    const accountAgeMs = settings.raidMinAccountAgeDays * DAY_MS;
    const young =
      settings.raidMinAccountAgeDays > 0 && signal.accountCreatedAt > signal.now - accountAgeMs;

    const cutoff = signal.now - windowMs;
    const records = (this.joins.get(guildId) ?? []).filter((record) => record.at > cutoff);
    records.push({ userId: signal.userId, at: signal.now, young: young });
    // A raid can be huge; keep only what the detector can act on.
    if (records.length > 1_000) records.splice(0, records.length - 1_000);

    this.joins.delete(guildId);
    this.joins.set(guildId, records);
    this.evictIfNeeded();

    const joins = records.length;
    const youngRecords = records.filter((record) => record.young);
    const triggered = settings.antiRaidEnabled && joins >= settings.raidJoinThreshold;

    return {
      triggered,
      joins,
      youngAccounts: youngRecords.length,
      youngAccountIds: youngRecords.map((record) => record.userId),
      windowMs,
      reason: triggered
        ? `${joins} joins in ${settings.raidWindowSeconds}s (threshold ${settings.raidJoinThreshold})`
        : null,
    };
  }

  /** Number of joins currently inside the window for a guild (diagnostics). */
  count(guildId: string, now: number, settings: SecuritySettings): number {
    const cutoff = now - settings.raidWindowSeconds * 1000;
    return (this.joins.get(guildId) ?? []).filter((record) => record.at > cutoff).length;
  }

  reset(guildId?: string): void {
    if (guildId === undefined) this.joins.clear();
    else this.joins.delete(guildId);
  }

  private evictIfNeeded(): void {
    while (this.joins.size > this.maxGuilds) {
      const oldest = this.joins.keys().next();
      if (oldest.done) return;
      this.joins.delete(oldest.value);
    }
  }
}
