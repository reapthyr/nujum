import { AuditLogEvent } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { respondToNuke } from "../security/nuke-response";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "webhooksUpdate",
  execute: async (client, channel) => {
    if (channel.isDMBased()) return;
    const guild = channel.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.WebhookCreate,
        logger: client.logger,
        // webhooksUpdate also fires for edits/deletes; require a create entry
        // for this exact channel so a recent create elsewhere is not attributed.
        matches: (entry) => {
          const target = entry.target as unknown as { channelId?: unknown } | null;
          return (
            typeof target === "object" &&
            target !== null &&
            "channelId" in target &&
            target.channelId === channel.id
          );
        },
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      await respondToNuke({
        client,
        guild,
        actorId,
        action: "WEBHOOK_CREATE",
        targetId: channel.id,
        detail: `webhook created in #${channel.name}`,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, channelId: channel.id },
        "webhooksUpdate security handler failed",
      );
    }
  },
});
