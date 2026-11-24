import { AuditLogEvent } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { respondToNuke } from "../security/nuke-response";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "guildBanAdd",
  execute: async (client, ban) => {
    const guild = ban.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.MemberBanAdd,
        targetId: ban.user.id,
        logger: client.logger,
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      await respondToNuke({
        client,
        guild,
        actorId,
        action: "BAN",
        targetId: ban.user.id,
        detail: `banned ${ban.user.tag}`,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: ban.user.id },
        "guildBanAdd security handler failed",
      );
    }
  },
});
