import { PermissionsBitField, type Guild, type Role } from "discord.js";
import type { NujumClient } from "../client/NujumClient";
import { serializeError } from "../lib/errors";
import { sendSecurityAlert } from "./alerts";
import type { EscalationResult } from "./escalation";
import { isExempt } from "./exemptions";

const NEUTRALIZE_PERMISSIONS =
  PermissionsBitField.Flags.Administrator |
  PermissionsBitField.Flags.ManageGuild |
  PermissionsBitField.Flags.ManageRoles |
  PermissionsBitField.Flags.ManageChannels |
  PermissionsBitField.Flags.ManageWebhooks |
  PermissionsBitField.Flags.BanMembers |
  PermissionsBitField.Flags.KickMembers |
  PermissionsBitField.Flags.ModerateMembers;

/** Alerts on role privilege changes and contains clear self-escalation. */
export async function respondToEscalation(options: {
  client: NujumClient;
  guild: Guild;
  actorId: string;
  role: Role;
  result: EscalationResult;
  created?: boolean;
}): Promise<void> {
  const { client, guild, actorId, role, result, created = false } = options;
  if (!(await client.modules.isEnabled(guild.id, "SECURITY"))) return;

  const snapshot = await client.security.snapshot(guild.id);
  const exempt = isExempt(
    { userId: actorId },
    {
      guildOwnerId: guild.ownerId,
      botUserId: client.user?.id ?? null,
      ownerIds: client.owners,
      whitelist: snapshot.whitelist,
    },
  );

  const reason = created
    ? `Role @${role.name} was created with dangerous permissions.`
    : `Role @${role.name} gained: ${result.newlyGranted.join(", ")}.`;

  let actionTaken = "Alert only (actor exempt)";
  if (!exempt && result.administrator) {
    try {
      const member = await guild.members.fetch(actorId).catch(() => null);
      if (member?.manageable) {
        const roles = [...member.roles.cache.values()].filter(
          (candidate) => (candidate.permissions.bitfield & NEUTRALIZE_PERMISSIONS) !== 0n,
        );
        if (roles.length > 0) {
          await member.roles.remove(roles, reason.slice(0, 500));
          actionTaken = `Removed ${roles.length} dangerous role(s) from actor`;
        }
      }
    } catch (error) {
      client.logger.warn(
        { err: serializeError(error), guildId: guild.id, actorId },
        "escalation containment failed",
      );
      actionTaken = "Alert only (containment failed)";
    }
  }

  const threat = {
    type: "PERMISSION_ESCALATION" as const,
    severity: 2 as const,
    actorId,
    reason,
    evidence: result.newlyGranted.join(", ") || "Administrator",
    actionTaken,
  };
  await client.security.recordThreat({
    guildId: guild.id,
    ...threat,
    details: { roleId: role.id, administrator: result.administrator, created },
  });
  await client.security.audit({
    guildId: guild.id,
    actorId: client.user?.id ?? "system",
    actorType: "BOT",
    action: "security.permission_escalation",
    targetType: "Role",
    targetId: role.id,
    reason,
    after: { actionTaken, permissions: result.newlyGranted },
  });

  client.logger.warn(
    { guildId: guild.id, actorId, roleId: role.id, actionTaken },
    "permission escalation detected",
  );
  if (client.securityThrottle.allow(`${guild.id}:escalation:${role.id}`, Date.now(), 60_000)) {
    await sendSecurityAlert({
      guild,
      settings: snapshot.settings,
      threat,
      logger: client.logger,
    });
  }
}
