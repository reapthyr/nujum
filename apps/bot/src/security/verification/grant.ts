import { PermissionsBitField, type Guild, type User } from "discord.js";
import { serializeError } from "../../lib/errors";
import type { NujumClient } from "../../client/NujumClient";
import type { VerificationSettings } from "./types";

/** Account age is evaluated from Discord's creation timestamp, never client input. */
export function meetsAccountAge(user: User, minDays: number, now: number): boolean {
  if (minDays <= 0) return true;
  return now - user.createdTimestamp >= minDays * 86_400_000;
}

export interface GrantResult {
  granted: boolean;
  reason: string;
}

/** Grants the configured role after re-checking hierarchy and bot permissions. */
export async function grantVerificationRole(
  client: NujumClient,
  guild: Guild,
  userId: string,
  settings: VerificationSettings,
): Promise<GrantResult> {
  if (!settings.roleId) return { granted: false, reason: "No verification role configured." };

  const role =
    guild.roles.cache.get(settings.roleId) ??
    (await guild.roles.fetch(settings.roleId).catch(() => null));
  if (!role) return { granted: false, reason: "The verification role no longer exists." };

  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { granted: false, reason: "I need the Manage Roles permission." };
  }
  if (!role.editable || me.roles.highest.position <= role.position) {
    return { granted: false, reason: "The verification role is above my highest role." };
  }

  try {
    const member = await guild.members.fetch(userId);
    if (member.roles.cache.has(role.id)) {
      await client.verification.markVerified(guild.id, userId);
      return { granted: true, reason: "You were already verified." };
    }
    await member.roles.add(role, "Verification completed");
    await client.verification.markVerified(guild.id, userId);
    await client.security.audit({
      guildId: guild.id,
      actorId: userId,
      actorType: "USER",
      action: "verification.completed",
      targetType: "User",
      targetId: userId,
      after: { roleId: role.id },
    });
    return { granted: true, reason: "Verified. Welcome!" };
  } catch (error) {
    client.logger.warn(
      { err: serializeError(error), guildId: guild.id, userId, roleId: role.id },
      "verification role grant failed",
    );
    return { granted: false, reason: "I could not assign the verification role." };
  }
}
