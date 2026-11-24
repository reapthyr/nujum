import { PermissionsBitField } from "discord.js";
import type { DiscordPermission } from "@nujum/shared";

/**
 * Permissions that can be used to damage a server. A role gaining one of these
 * is worth an alert; gaining Administrator or several at once is an incident.
 */
export const DANGEROUS_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "ManageWebhooks",
  "BanMembers",
  "KickMembers",
  "ModerateMembers",
] as const satisfies readonly DiscordPermission[];

const FLAGS = PermissionsBitField.Flags as unknown as Record<string, bigint>;

export interface EscalationResult {
  administrator: boolean;
  newlyGranted: DiscordPermission[];
  significant: boolean;
}

/** Compares two permission bitfields and reports dangerous additions. */
export function detectEscalation(before: bigint, after: bigint): EscalationResult {
  const added = after & ~before;
  const newlyGranted = DANGEROUS_PERMISSIONS.filter((name) => {
    const bit = FLAGS[name];
    if (bit === undefined) throw new Error(`Unknown Discord permission: ${name}`);
    return (added & bit) !== 0n;
  });

  return {
    administrator: (added & PermissionsBitField.Flags.Administrator) !== 0n,
    newlyGranted,
    significant:
      newlyGranted.length >= 2 || (added & PermissionsBitField.Flags.Administrator) !== 0n,
  };
}
