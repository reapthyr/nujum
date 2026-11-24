import type { Punishment, ThreatType } from "@nujum/shared";
import {
  extractInviteCode,
  extractLinks,
  hostFromUrl,
  isHostAllowed,
  isOfficialDiscordHost,
  isPhishingHost,
} from "./phishing";
import type { SecuritySettings, WhitelistSets } from "./types";

export interface MessageSignal {
  guildId: string;
  channelId: string;
  userId: string;
  content: string;
  mentionCount: number;
  now: number;
}

export interface SpamVerdict {
  type: ThreatType;
  severity: 1 | 2 | 3;
  reason: string;
  evidence: string;
  /** Punishment requested by the classifier; the executor may downgrade it. */
  action: Punishment;
}

interface UserState {
  times: number[];
  contents: { hash: number; at: number }[];
  lastSeen: number;
}

const DUPLICATE_THRESHOLD = 3;
const MAX_STATE_KEYS = 20_000;

function hashContent(value: string): number {
  let hash = 0x811c9dc5;
  const text = value.slice(0, 2_000);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function messageAction(settings: SecuritySettings, type: ThreatType): Punishment {
  switch (type) {
    case "PHISHING":
      return settings.spamAction === "NONE" ? "DELETE" : settings.spamAction;
    case "SPAM":
    case "FLOOD":
    case "MASS_MENTION":
      return settings.spamAction;
    case "INVITE":
    case "LINK":
      return "DELETE";
    default:
      return "DELETE";
  }
}

/**
 * Message classifier: phishing, invites, links, mention floods, duplicate
 * floods and plain message-rate spam. Returns the highest-severity finding.
 */
export class SpamDetector {
  private readonly users = new Map<string, UserState>();

  record(
    signal: MessageSignal,
    settings: SecuritySettings,
    whitelist: WhitelistSets,
  ): SpamVerdict | null {
    const content = signal.content;
    const links = extractLinks(content);

    if (settings.phishingDetection) {
      for (const link of links) {
        const host = hostFromUrl(link);
        if (host && isPhishingHost(host, content)) {
          return {
            type: "PHISHING",
            severity: 3,
            reason: "Message contains a known phishing or typosquatted link.",
            evidence: host,
            action: messageAction(settings, "PHISHING"),
          };
        }
      }
    }

    if (settings.inviteFilterEnabled) {
      const code = extractInviteCode(content);
      if (code) {
        const allowed = new Set(
          [...settings.allowedInviteCodes, ...whitelist.invites].map((entry) =>
            entry.toLowerCase(),
          ),
        );
        if (!allowed.has(code)) {
          return {
            type: "INVITE",
            severity: 1,
            reason: "Message contains a Discord invite that is not allowed here.",
            evidence: `discord.gg/${code}`,
            action: messageAction(settings, "INVITE"),
          };
        }
      }
    }

    if (settings.linkFilterEnabled) {
      const allowedDomains = [...settings.allowedDomains, ...whitelist.domains];
      // With no allowlist the filter would delete every link in the server; treat
      // an empty list as "phishing detection only" and require an explicit list.
      if (allowedDomains.length > 0) {
        for (const link of links) {
          const host = hostFromUrl(link);
          if (!host || isOfficialDiscordHost(host) || isHostAllowed(host, allowedDomains)) continue;
          return {
            type: "LINK",
            severity: 1,
            reason: "Message contains a link that is not on the server allowlist.",
            evidence: host,
            action: messageAction(settings, "LINK"),
          };
        }
      }
    }

    if (settings.mentionLimit > 0 && signal.mentionCount > settings.mentionLimit) {
      return {
        type: "MASS_MENTION",
        severity: 2,
        reason: `Message mentions ${signal.mentionCount} users (limit ${settings.mentionLimit}).`,
        evidence: `mentions:${signal.mentionCount}`,
        action: messageAction(settings, "MASS_MENTION"),
      };
    }

    if (!settings.antiSpamEnabled) return null;

    const state = this.stateFor(signal.guildId, signal.userId, signal.now);
    const windowMs = settings.spamWindowSeconds * 1000;
    const cutoff = signal.now - windowMs;

    state.times = state.times.filter((at) => at > cutoff);
    state.contents = state.contents.filter((entry) => entry.at > cutoff);
    state.times.push(signal.now);

    const trimmed = content.trim().toLowerCase();
    if (trimmed.length >= 3) {
      const hash = hashContent(trimmed);
      state.contents.push({ hash, at: signal.now });
      const duplicates = state.contents.filter((entry) => entry.hash === hash).length;
      if (duplicates >= DUPLICATE_THRESHOLD) {
        return {
          type: "FLOOD",
          severity: 2,
          reason: `Repeated the same message ${duplicates} times in ${settings.spamWindowSeconds}s.`,
          evidence: `duplicate:${duplicates}`,
          action: messageAction(settings, "FLOOD"),
        };
      }
    }

    if (state.times.length >= settings.spamThreshold) {
      return {
        type: "SPAM",
        severity: 2,
        reason: `${state.times.length} messages in ${settings.spamWindowSeconds}s (limit ${settings.spamThreshold}).`,
        evidence: `rate:${state.times.length}`,
        action: messageAction(settings, "SPAM"),
      };
    }

    return null;
  }

  reset(key?: string): void {
    if (key === undefined) this.users.clear();
    else this.users.delete(key);
  }

  get size(): number {
    return this.users.size;
  }

  private stateFor(guildId: string, userId: string, now: number): UserState {
    const key = `${guildId}:${userId}`;
    let state = this.users.get(key);
    if (state) {
      this.users.delete(key);
      state.lastSeen = now;
      this.users.set(key, state);
      return state;
    }

    state = { times: [], contents: [], lastSeen: now };
    this.users.set(key, state);
    while (this.users.size > MAX_STATE_KEYS) {
      const oldest = this.users.keys().next();
      if (oldest.done) break;
      this.users.delete(oldest.value);
    }
    return state;
  }
}
