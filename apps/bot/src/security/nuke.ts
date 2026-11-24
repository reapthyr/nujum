import type { ThreatType } from "@nujum/shared";
import type { SecuritySettings } from "./types";

export type NukeAction = "CHANNEL_DELETE" | "ROLE_DELETE" | "BAN" | "KICK" | "WEBHOOK_CREATE";

export const NUKE_THREAT_BY_ACTION: Readonly<Record<NukeAction, ThreatType>> = Object.freeze({
  CHANNEL_DELETE: "MASS_CHANNEL_DELETE",
  ROLE_DELETE: "MASS_ROLE_DELETE",
  BAN: "MASS_BAN",
  KICK: "MASS_KICK",
  WEBHOOK_CREATE: "WEBHOOK_CREATE",
});

export interface NukeVerdict {
  triggered: boolean;
  type: ThreatType | null;
  count: number;
  windowMs: number;
  reason: string | null;
}

/**
 * Per-actor destructive-action detector. Each action type has its own window,
 * so three channel deletions do not combine with three bans to look like six
 * deletions.
 */
export class NukeDetector {
  private readonly events = new Map<string, { action: NukeAction; at: number }[]>();

  constructor(private readonly maxActors = 20_000) {}

  record(
    guildId: string,
    actorId: string,
    action: NukeAction,
    now: number,
    settings: SecuritySettings,
  ): NukeVerdict {
    const windowMs = settings.nukeWindowSeconds * 1000;
    const key = `${guildId}:${actorId}`;
    const cutoff = now - windowMs;

    const events = (this.events.get(key) ?? []).filter((event) => event.at > cutoff);
    events.push({ action, at: now });
    if (events.length > 500) events.splice(0, events.length - 500);

    this.events.delete(key);
    this.events.set(key, events);
    this.evictIfNeeded();

    const count = events.reduce((total, event) => (event.action === action ? total + 1 : total), 0);
    const triggered = settings.antiNukeEnabled && count >= settings.nukeThreshold;

    return {
      triggered,
      type: triggered ? NUKE_THREAT_BY_ACTION[action] : null,
      count,
      windowMs,
      reason: triggered
        ? `${count} × ${action} in ${settings.nukeWindowSeconds}s (threshold ${settings.nukeThreshold})`
        : null,
    };
  }

  reset(key?: string): void {
    if (key === undefined) this.events.clear();
    else this.events.delete(key);
  }

  private evictIfNeeded(): void {
    while (this.events.size > this.maxActors) {
      const oldest = this.events.keys().next();
      if (oldest.done) return;
      this.events.delete(oldest.value);
    }
  }
}
