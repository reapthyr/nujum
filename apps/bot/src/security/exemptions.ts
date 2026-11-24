import { PermissionsBitField, type GuildMember } from "discord.js";
import type { WhitelistSets } from "./types";

export interface ExemptionContext {
  guildOwnerId: string;
  botUserId: string | null;
  /** Global bot owners configured through OWNER_IDS. */
  ownerIds: ReadonlySet<string>;
  whitelist: WhitelistSets;
  channelId?: string | null;
  /**
   * Anti-spam exempts staff so a compromised moderator cannot time out the
   * whole team, but anti-nuke must never exempt staff — that is its whole job.
   */
  exemptStaff?: boolean;
}

export interface ExemptionSubject {
  userId: string;
  roleIds?: Iterable<string>;
  staff?: boolean;
}

const STAFF_PERMISSIONS =
  PermissionsBitField.Flags.Administrator |
  PermissionsBitField.Flags.ManageGuild |
  PermissionsBitField.Flags.ManageMessages;

export function isExempt(subject: ExemptionSubject, context: ExemptionContext): boolean {
  if (subject.userId === context.guildOwnerId) return true;
  if (context.botUserId !== null && subject.userId === context.botUserId) return true;
  if (context.ownerIds.has(subject.userId)) return true;
  if (context.whitelist.users.has(subject.userId)) return true;

  if (context.channelId && context.whitelist.channels.has(context.channelId)) return true;

  if (subject.roleIds) {
    for (const roleId of subject.roleIds) {
      if (context.whitelist.roles.has(roleId)) return true;
    }
  }

  if (context.exemptStaff === true && subject.staff === true) return true;
  return false;
}

export function subjectFromMember(member: GuildMember): ExemptionSubject {
  return {
    userId: member.id,
    roleIds: member.roles.cache.keys(),
    staff: member.permissions.has(STAFF_PERMISSIONS),
  };
}
