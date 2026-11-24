import { jtcActionSchema, jtcPresetSchema } from "@nujum/shared";
import type { JtcRoomRecord, JtcSettings } from "./types";

export interface JtcActor {
  id: string;
  roleIds: readonly string[];
  hasManageChannels: boolean;
  isGuildOwner: boolean;
}

export function toJtcActor(input: {
  id: string;
  roleIds: readonly string[];
  permissions: { has(bits: bigint): boolean };
  guildOwnerId: string;
  manageChannelsBit: bigint;
}): JtcActor {
  return {
    id: input.id,
    roleIds: input.roleIds,
    hasManageChannels: input.permissions.has(input.manageChannelsBit),
    isGuildOwner: input.id === input.guildOwnerId,
  };
}

/** Owners, guild staff and configured trusted roles may manage a room. */
export function canManageRoom(
  room: Pick<JtcRoomRecord, "ownerId">,
  settings: Pick<JtcSettings, "trustedRoleIds">,
  actor: JtcActor,
): boolean {
  return (
    room.ownerId === actor.id ||
    actor.isGuildOwner ||
    actor.hasManageChannels ||
    actor.roleIds.some((roleId) => settings.trustedRoleIds.includes(roleId))
  );
}

/** Transferring ownership and moderating members requires explicit authority. */
export function canTransferRoom(room: Pick<JtcRoomRecord, "ownerId">, actor: JtcActor): boolean {
  return room.ownerId === actor.id || actor.isGuildOwner || actor.hasManageChannels;
}

export function validateJtcAction(input: unknown): ReturnType<typeof jtcActionSchema.parse> {
  const action = jtcActionSchema.parse(input);
  if (action.action === "LIMIT" && (action.value ?? 0) > 99) {
    throw new Error("Voice limit must be between 0 and 99.");
  }
  if (action.action === "BITRATE" && (action.value ?? 8) < 8) {
    throw new Error("Bitrate must be at least 8 kbps.");
  }
  return action;
}

export function validateJtcPreset(input: unknown): ReturnType<typeof jtcPresetSchema.parse> {
  return jtcPresetSchema.parse(input);
}
