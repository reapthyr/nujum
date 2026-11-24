import type { AuditLogEvent, Guild, GuildAuditLogsEntry } from "discord.js";
import { serializeError } from "./errors";
import type { BotLogger } from "./logger";

interface FindActorOptions {
  guild: Guild;
  type: AuditLogEvent;
  /** When given, only entries affecting this id are considered. */
  targetId?: string;
  logger: BotLogger;
  /** Audit entries older than this are treated as unrelated. */
  maxAgeMs?: number;
  /** Extra entry-level check for events without a single target id. */
  matches?: (entry: GuildAuditLogsEntry) => boolean;
}

/**
 * Resolves the user responsible for a destructive gateway event.
 *
 * Discord audit logs are eventually consistent, so only recent entries whose
 * target matches are accepted. A missing/unknown actor means "alert only" —
 * the bot never guesses and punishes an innocent member.
 */
export async function findAuditActor(options: FindActorOptions): Promise<string | null> {
  const maxAgeMs = options.maxAgeMs ?? 15_000;
  try {
    const logs = await options.guild.fetchAuditLogs({ type: options.type, limit: 10 });
    const now = Date.now();
    const matches = logs.entries.filter(
      (entry: GuildAuditLogsEntry) =>
        now - entry.createdTimestamp <= maxAgeMs &&
        (options.targetId === undefined || entry.targetId === options.targetId) &&
        (options.matches?.(entry) ?? true),
    );
    const actor = matches.first()?.executorId ?? null;
    return actor;
  } catch (error) {
    options.logger.debug(
      { err: serializeError(error), guildId: options.guild.id, type: options.type },
      "audit log lookup failed",
    );
    return null;
  }
}

/** True when the audit entry was produced by this bot (legitimate moderation). */
export function isBotActor(actorId: string | null, botUserId: string | null): boolean {
  return actorId !== null && botUserId !== null && actorId === botUserId;
}
