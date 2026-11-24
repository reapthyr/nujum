import type { GuildMember, Message } from "discord.js";
import type { Punishment } from "@nujum/shared";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";

export type PunishmentScope = "message" | "raid" | "nuke";

export interface PunishmentInput {
  punishment: Punishment;
  reason: string;
  logger: BotLogger;
  scope: PunishmentScope;
  member?: GuildMember | null;
  message?: Message | null;
}

export interface PunishmentResult {
  applied: boolean;
  description: string;
}

const TIMEOUT_MS = 10 * 60_000;

async function deleteMessage(message: Message | null | undefined): Promise<boolean> {
  if (!message?.deletable) return false;
  try {
    await message.delete();
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies a punishment with hierarchy checks delegated to discord.js
 * (`moderatable` / `kickable` / `bannable`). Every branch is best-effort: a
 * missing permission must not stop the rest of the security response.
 */
export async function applyPunishment(input: PunishmentInput): Promise<PunishmentResult> {
  const { punishment, reason, logger, member, message, scope } = input;
  const shortReason = reason.slice(0, 500);
  let action = punishment;

  // A lockdown is a guild action, not a member action; downgrade it here.
  if (action === "LOCKDOWN" && scope === "message") action = "TIMEOUT";

  try {
    switch (action) {
      case "NONE":
        return { applied: false, description: "Alert only" };
      case "DELETE": {
        const deleted = await deleteMessage(message);
        return {
          applied: deleted,
          description: deleted ? "Message deleted" : "Message already gone",
        };
      }
      case "WARN": {
        if (!member) return { applied: false, description: "Warning logged" };
        await member
          .send({
            content: `A moderator removed your message in **${member.guild.name}**: ${shortReason}`,
            allowedMentions: { parse: [] },
          })
          .catch(() => undefined);
        return { applied: true, description: "Member warned by DM" };
      }
      case "TIMEOUT": {
        if (!member?.moderatable) {
          return { applied: false, description: "Could not time out (hierarchy or permissions)" };
        }
        await member.timeout(TIMEOUT_MS, shortReason);
        return { applied: true, description: "Member timed out for 10 minutes" };
      }
      case "KICK": {
        if (!member?.kickable) {
          return { applied: false, description: "Could not kick (hierarchy or permissions)" };
        }
        await member.kick(shortReason);
        return { applied: true, description: "Member kicked" };
      }
      case "BAN": {
        if (!member?.bannable) {
          return { applied: false, description: "Could not ban (hierarchy or permissions)" };
        }
        await member.ban({ reason: shortReason, deleteMessageSeconds: 0 });
        return { applied: true, description: "Member banned" };
      }
      case "LOCKDOWN":
        return { applied: false, description: "Lockdown handled separately" };
    }
  } catch (error) {
    logger.warn(
      {
        err: serializeError(error),
        guildId: member?.guild.id,
        userId: member?.id,
        punishment: action,
      },
      "punishment failed",
    );
    return { applied: false, description: `Could not apply ${action.toLowerCase()}` };
  }
}
