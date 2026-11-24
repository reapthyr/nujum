import {
  PermissionsBitField,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type PermissionResolvable,
} from "discord.js";
import {
  DISCORD_PERMISSIONS,
  hasDiscordPermissions,
  missingDiscordPermissions,
  type DiscordPermission,
} from "@nujum/shared";
import { BotError, ERROR_CODES } from "./errors";

/**
 * Permission and hierarchy checks live in one place so commands, buttons and
 * API routes cannot drift. Discord UI defaults are never trusted.
 */

const FLAGS = PermissionsBitField.Flags as unknown as Record<string, bigint>;

const PERMISSION_BITS: Readonly<Record<DiscordPermission, bigint>> = Object.freeze(
  Object.fromEntries(
    DISCORD_PERMISSIONS.map((name) => {
      const bit = FLAGS[name];
      if (bit === undefined) throw new Error(`Unknown Discord permission: ${name}`);
      return [name, bit];
    }),
  ) as Record<DiscordPermission, bigint>,
);

/** Asserts the shared permission registry and discord.js agree at startup. */
export function assertPermissionRegistry(): void {
  for (const name of DISCORD_PERMISSIONS) {
    if (FLAGS[name] === undefined) throw new Error(`discord.js is missing permission: ${name}`);
  }
}

export function permissionBits(permissions: readonly DiscordPermission[]): bigint {
  return permissions.reduce((mask, permission) => mask | PERMISSION_BITS[permission], 0n);
}

export function toPermissionResolvable(
  permissions: readonly DiscordPermission[],
): PermissionResolvable[] {
  return permissions.map((permission) => PERMISSION_BITS[permission]);
}

export function memberPermissionNames(member: GuildMember): Set<DiscordPermission> {
  const granted = member.permissions;
  return new Set(DISCORD_PERMISSIONS.filter((name) => granted.has(PERMISSION_BITS[name])));
}

export function channelPermissionNames(
  channel: GuildBasedChannel | null,
  member: GuildMember,
): Set<DiscordPermission> {
  const permissions = channel?.permissionsFor(member) ?? null;
  if (!permissions) return new Set();
  return new Set(DISCORD_PERMISSIONS.filter((name) => permissions.has(PERMISSION_BITS[name])));
}

export interface PermissionCheck {
  member: GuildMember;
  channel: GuildBasedChannel | null;
  required: readonly DiscordPermission[];
  /** Distinguishes "you" from "the bot" in the error message. */
  actor: "user" | "bot";
}

export function assertPermissions({ member, channel, required, actor }: PermissionCheck): void {
  if (required.length === 0) return;
  const granted = channel ? channelPermissionNames(channel, member) : memberPermissionNames(member);
  if (hasDiscordPermissions(granted, required)) return;

  const missing = missingDiscordPermissions(granted, required);
  throw new BotError(
    actor === "user" ? ERROR_CODES.missingPermissions : ERROR_CODES.botMissingPermissions,
    actor === "user"
      ? `You need the following permissions: ${missing.join(", ")}.`
      : `I need the following permissions: ${missing.join(", ")}.`,
    { meta: { missing, actor } },
  );
}

export type HierarchyFailure =
  "self" | "bot-self" | "owner" | "actor-role-too-low" | "bot-role-too-low" | "not-in-guild";

export interface HierarchyCheck {
  guild: Guild;
  actor: GuildMember;
  target: GuildMember;
  me: GuildMember;
}

/**
 * Returns `null` when `actor` may moderate `target`, otherwise a reason.
 * The guild owner outranks everyone; nobody outranks the owner.
 */
export function hierarchyFailure({
  guild,
  actor,
  target,
  me,
}: HierarchyCheck): HierarchyFailure | null {
  if (target.id === actor.id) return "self";
  if (target.id === me.id) return "bot-self";
  if (target.id === guild.ownerId) return "owner";
  if (actor.id !== guild.ownerId && actor.roles.highest.position <= target.roles.highest.position) {
    return "actor-role-too-low";
  }
  if (me.roles.highest.position <= target.roles.highest.position) return "bot-role-too-low";
  return null;
}

const HIERARCHY_MESSAGES: Record<HierarchyFailure, string> = {
  self: "You cannot moderate yourself.",
  "bot-self": "I cannot moderate myself.",
  owner: "The server owner cannot be moderated.",
  "actor-role-too-low":
    "You cannot moderate a member whose highest role is equal to or above yours.",
  "bot-role-too-low":
    "My highest role is not above that member's highest role, so I cannot act on them.",
  "not-in-guild": "That member is no longer in this server.",
};

export function assertHierarchy(check: HierarchyCheck): void {
  const failure = hierarchyFailure(check);
  if (failure === null) return;
  throw new BotError(ERROR_CODES.hierarchy, HIERARCHY_MESSAGES[failure], { meta: { failure } });
}
