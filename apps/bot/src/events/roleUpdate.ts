import { AuditLogEvent } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { detectEscalation } from "../security/escalation";
import { respondToEscalation } from "../security/escalation-response";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "roleUpdate",
  execute: async (client, oldRole, newRole) => {
    const result = detectEscalation(oldRole.permissions.bitfield, newRole.permissions.bitfield);
    if (!result.significant) return;

    const guild = newRole.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.RoleUpdate,
        targetId: newRole.id,
        logger: client.logger,
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      await respondToEscalation({ client, guild, actorId, role: newRole, result });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, roleId: newRole.id },
        "roleUpdate security handler failed",
      );
    }
  },
});
