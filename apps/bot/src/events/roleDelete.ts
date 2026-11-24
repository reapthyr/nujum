import { AuditLogEvent } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { respondToNuke } from "../security/nuke-response";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "roleDelete",
  execute: async (client, role) => {
    const guild = role.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.RoleDelete,
        targetId: role.id,
        logger: client.logger,
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      await respondToNuke({
        client,
        guild,
        actorId,
        action: "ROLE_DELETE",
        targetId: role.id,
        detail: role.name,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, roleId: role.id },
        "roleDelete security handler failed",
      );
    }
  },
});
