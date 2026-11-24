import { AuditLogEvent } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { respondToNuke } from "../security/nuke-response";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "channelDelete",
  execute: async (client, channel) => {
    if (channel.isDMBased()) return;
    const guild = channel.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.ChannelDelete,
        targetId: channel.id,
        logger: client.logger,
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      await respondToNuke({
        client,
        guild,
        actorId,
        action: "CHANNEL_DELETE",
        targetId: channel.id,
        detail: channel.name,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, channelId: channel.id },
        "channelDelete security handler failed",
      );
    }
  },
});
