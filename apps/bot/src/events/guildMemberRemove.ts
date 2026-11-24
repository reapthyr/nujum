import { AuditLogEvent } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { respondToNuke } from "../security/nuke-response";
import { defineEvent } from "./types";

/** Only a recent kick audit entry distinguishes a kick from a voluntary leave. */
export const event = defineEvent({
  name: "guildMemberRemove",
  execute: async (client, member) => {
    const guild = member.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.MemberKick,
        targetId: member.id,
        logger: client.logger,
        maxAgeMs: 10_000,
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      await respondToNuke({
        client,
        guild,
        actorId,
        action: "KICK",
        targetId: member.id,
        detail: `kicked ${member.user.tag}`,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: member.id },
        "guildMemberRemove security handler failed",
      );
    }
  },
});
