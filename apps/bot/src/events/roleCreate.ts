import { AuditLogEvent, PermissionsBitField } from "discord.js";
import { findAuditActor, isBotActor } from "../lib/audit-log";
import { serializeError } from "../lib/errors";
import { DANGEROUS_PERMISSIONS, detectEscalation } from "../security/escalation";
import { respondToEscalation } from "../security/escalation-response";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "roleCreate",
  execute: async (client, role) => {
    if (!role.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const guild = role.guild;
    try {
      const actorId = await findAuditActor({
        guild,
        type: AuditLogEvent.RoleCreate,
        targetId: role.id,
        logger: client.logger,
      });
      if (!actorId || isBotActor(actorId, client.user?.id ?? null)) return;
      const result = detectEscalation(0n, role.permissions.bitfield);
      await respondToEscalation({
        client,
        guild,
        actorId,
        role,
        result: { ...result, newlyGranted: [...DANGEROUS_PERMISSIONS] },
        created: true,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, roleId: role.id },
        "roleCreate security handler failed",
      );
    }
  },
});
