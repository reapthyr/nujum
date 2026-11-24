import { PermissionsBitField, type Guild, type GuildMember } from "discord.js";
import { serializeError } from "../lib/errors";
import { sendSecurityAlert } from "./alerts";
import { isExempt } from "./exemptions";
import { activateLockdown } from "./lockdown";
import type { NukeAction } from "./nuke";
import type { NujumClient } from "../client/NujumClient";

const NEUTRALIZE_PERMISSIONS =
  PermissionsBitField.Flags.Administrator |
  PermissionsBitField.Flags.ManageGuild |
  PermissionsBitField.Flags.ManageRoles |
  PermissionsBitField.Flags.ManageChannels |
  PermissionsBitField.Flags.ManageWebhooks |
  PermissionsBitField.Flags.BanMembers |
  PermissionsBitField.Flags.KickMembers |
  PermissionsBitField.Flags.ModerateMembers;

export interface NukeResponseInput {
  client: NujumClient;
  guild: Guild;
  actorId: string;
  action: NukeAction;
  targetId?: string | null;
  detail?: string;
}

/**
 * Shared response to a confirmed destructive-action burst.
 *
 * Never exempts staff: a compromised moderator is the threat model. The guild
 * owner, bot and configured whitelist are the only exemptions.
 */
export async function respondToNuke(input: NukeResponseInput): Promise<void> {
  const { client, guild, actorId, action } = input;
  const logger = client.logger;
  if (!(await client.modules.isEnabled(guild.id, "SECURITY"))) return;

  const snapshot = await client.security.snapshot(guild.id);
  const verdict = client.nukeDetector.record(
    guild.id,
    actorId,
    action,
    Date.now(),
    snapshot.settings,
  );
  if (!verdict.triggered || verdict.type === null) return;

  const reason = verdict.reason ?? "Destructive action threshold reached.";
  const exempt = isExempt(
    { userId: actorId },
    {
      guildOwnerId: guild.ownerId,
      botUserId: client.user?.id ?? null,
      ownerIds: client.owners,
      whitelist: snapshot.whitelist,
      // Deliberately no `exemptStaff`.
    },
  );

  let actionTaken = "Alert only (actor exempt)";
  let lockdownActive = false;
  let member: GuildMember | null = null;

  if (!exempt) {
    try {
      member = await guild.members.fetch(actorId).catch(() => null);
      if (member?.bannable) {
        await member.ban({ reason: reason.slice(0, 500), deleteMessageSeconds: 0 });
        actionTaken = "Actor banned";
      } else if (member && member.manageable) {
        const roles = [...member.roles.cache.values()].filter(
          (role) => (role.permissions.bitfield & NEUTRALIZE_PERMISSIONS) !== 0n,
        );
        if (roles.length > 0) {
          await member.roles.remove(roles, reason.slice(0, 500));
          actionTaken = `Removed ${roles.length} dangerous role(s)`;
        } else {
          actionTaken = "Alert only (actor could not be moderated)";
        }
      } else {
        actionTaken = "Alert only (actor not manageable)";
      }
    } catch (error) {
      logger.warn(
        { err: serializeError(error), guildId: guild.id, actorId },
        "nuke response failed",
      );
      actionTaken = "Alert only (punishment failed)";
    }
  }

  if (snapshot.settings.autoLockdown) {
    const lockdown = await activateLockdown(guild, client.security, logger, {
      reason,
      activatedBy: client.user?.id ?? "system",
    });
    if (lockdown.changed > 0) {
      lockdownActive = true;
      actionTaken += "; guild locked";
    }
  }

  const threat = {
    type: verdict.type,
    severity: 3 as const,
    actorId,
    channelId: input.targetId ?? null,
    reason,
    evidence: `${action} × ${verdict.count}${input.detail ? ` — ${input.detail}` : ""}`,
    actionTaken,
  };

  await client.security.recordThreat({
    guildId: guild.id,
    ...threat,
    details: {
      count: verdict.count,
      windowSeconds: verdict.windowMs / 1000,
      action,
      targetId: input.targetId ?? null,
    },
  });
  await client.security.audit({
    guildId: guild.id,
    actorId: client.user?.id ?? "system",
    actorType: "BOT",
    action: `security.nuke.${verdict.type.toLowerCase()}`,
    targetType: "User",
    targetId: actorId,
    reason,
    after: { actionTaken, count: verdict.count },
  });

  logger.error(
    { guildId: guild.id, actorId, action, count: verdict.count, actionTaken },
    "nuke detected",
  );

  if (client.securityThrottle.allow(`${guild.id}:nuke:${actorId}`, Date.now(), 60_000)) {
    await sendSecurityAlert({
      guild,
      settings: snapshot.settings,
      threat,
      logger,
      lockdownActive,
    });
  }
}
