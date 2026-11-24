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

    // JTC rooms must be marked deleted even when the bot itself removed the
    // empty channel, so this runs before the audit-actor early return.
    try {
      await client.jtc.markChannelDeleted(guild.id, channel.id);
    } catch (error) {
      client.logger.warn(
        { err: serializeError(error), guildId: guild.id, channelId: channel.id },
        "channelDelete JTC cleanup failed",
      );
    }

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
