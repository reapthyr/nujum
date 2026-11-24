import {
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type GuildBasedChannel,
  type NonThreadGuildBasedChannel,
  type PermissionOverwrites,
  type PermissionOverwriteOptions,
} from "discord.js";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";
import type { GuildSecurityService } from "./service";
import type { LockdownOverwrite, LockdownRecord, LockdownSnapshotChannel } from "./types";

const LOCK_PERMISSIONS = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
} as const;

const LOCK_BITS =
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.CreatePublicThreads |
  PermissionFlagsBits.CreatePrivateThreads |
  PermissionFlagsBits.AddReactions;

function isLockable(channel: GuildBasedChannel): channel is NonThreadGuildBasedChannel {
  if (channel.isThread()) return false;
  return channel.isTextBased() || channel.isVoiceBased();
}

function canManage(channel: GuildBasedChannel, guild: Guild): boolean {
  const me = guild.members.me;
  if (!me) return false;
  return channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageRoles) === true;
}

function serializeOverwrite(
  overwrite: PermissionOverwrites | undefined,
): LockdownOverwrite["previous"] {
  if (!overwrite) return null;
  return {
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  };
}

/** Uses named Discord flags so no raw bitfield is ever sent to the API. */
function restoreOptions(
  previous: NonNullable<LockdownOverwrite["previous"]>,
): PermissionOverwriteOptions {
  const restored: PermissionOverwriteOptions = {};
  for (const name of new PermissionsBitField(BigInt(previous.allow)).toArray()) {
    restored[name] = true;
  }
  for (const name of new PermissionsBitField(BigInt(previous.deny)).toArray()) {
    restored[name] = false;
  }
  return restored;
}

export interface LockdownResult {
  changed: number;
  record: LockdownRecord;
}

/**
 * Denies send permissions in every manageable text/voice channel. `@everyone`
 * and any role/member overwrite that explicitly allows one of those permissions
 * are denied, so a role-specific allow cannot bypass the lockdown. Every
 * replaced overwrite is stored and restored exactly.
 */
export async function activateLockdown(
  guild: Guild,
  service: GuildSecurityService,
  logger: BotLogger,
  options: { reason: string; activatedBy: string },
): Promise<LockdownResult> {
  const existing = await service.lockdown(guild.id);
  if (existing.active) return { changed: 0, record: existing };

  const everyone = guild.roles.everyone;
  const snapshot: LockdownSnapshotChannel[] = [];

  for (const channel of guild.channels.cache.values()) {
    if (!isLockable(channel) || !canManage(channel, guild)) continue;

    const targets = new Set<string>([everyone.id]);
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      if ((overwrite.allow.bitfield & LOCK_BITS) !== 0n) targets.add(overwrite.id);
    }

    const overwrites: LockdownOverwrite[] = [];
    for (const id of targets) {
      try {
        const previous = channel.permissionOverwrites.cache.get(id);
        await channel.permissionOverwrites.edit(id, LOCK_PERMISSIONS, {
          reason: options.reason.slice(0, 500),
        });
        overwrites.push({ id, previous: serializeOverwrite(previous) });
      } catch (error) {
        logger.warn(
          {
            err: serializeError(error),
            guildId: guild.id,
            channelId: channel.id,
            overwriteId: id,
          },
          "failed to lock channel overwrite",
        );
      }
    }

    // Only record overwrites we actually changed, so unlock never touches an
    // unrelated permission.
    if (overwrites.length > 0) {
      snapshot.push({
        channelId: channel.id,
        previous: overwrites.find((entry) => entry.id === everyone.id)?.previous ?? null,
        overwrites,
      });
    }
  }

  const record: LockdownRecord = {
    active: true,
    reason: options.reason,
    activatedBy: options.activatedBy,
    activatedAt: new Date(),
    snapshot: { channels: snapshot },
  };
  await service.saveLockdown(guild.id, record);
  await service.audit({
    guildId: guild.id,
    actorId: options.activatedBy,
    actorType: options.activatedBy === guild.client.user?.id ? "BOT" : "SYSTEM",
    action: "security.lockdown.activate",
    targetType: "Guild",
    targetId: guild.id,
    reason: options.reason,
    after: { channels: snapshot.length },
  });

  logger.warn(
    { guildId: guild.id, channels: snapshot.length, reason: options.reason },
    "guild lockdown activated",
  );
  return { changed: snapshot.length, record };
}

/**
 * Restores every overwrite captured by `activateLockdown`. Failures stay in the
 * snapshot so a later press of the unlock button can retry; lockdown state is
 * only cleared once every captured channel/overwrite has been restored.
 */
export async function deactivateLockdown(
  guild: Guild,
  service: GuildSecurityService,
  logger: BotLogger,
  options: { reason: string; actorId: string },
): Promise<LockdownResult> {
  const existing = await service.lockdown(guild.id);
  if (!existing.active) return { changed: 0, record: existing };

  const everyone = guild.roles.everyone;
  let changed = 0;
  const remaining: LockdownSnapshotChannel[] = [];

  for (const entry of existing.snapshot.channels) {
    const channel = guild.channels.cache.get(entry.channelId);
    // A deleted channel no longer exists to restore.
    if (!channel || !isLockable(channel)) continue;
    if (!canManage(channel, guild)) {
      remaining.push(entry);
      continue;
    }

    const targets = entry.overwrites ?? [{ id: everyone.id, previous: entry.previous }];
    const failed: LockdownOverwrite[] = [];
    for (const target of targets) {
      try {
        if (target.previous) {
          await channel.permissionOverwrites.edit(target.id, restoreOptions(target.previous), {
            reason: options.reason.slice(0, 500),
          });
        } else {
          await channel.permissionOverwrites.delete(target.id, options.reason.slice(0, 500));
        }
        changed += 1;
      } catch (error) {
        logger.warn(
          {
            err: serializeError(error),
            guildId: guild.id,
            channelId: channel.id,
            overwriteId: target.id,
          },
          "failed to unlock channel overwrite",
        );
        failed.push(target);
      }
    }

    if (failed.length > 0) {
      remaining.push({ channelId: entry.channelId, previous: entry.previous, overwrites: failed });
    }
  }

  const stillActive = remaining.length > 0;
  const record: LockdownRecord = {
    active: stillActive,
    reason: stillActive ? (existing.reason ?? options.reason) : options.reason,
    activatedBy: existing.activatedBy,
    activatedAt: existing.activatedAt,
    snapshot: { channels: remaining },
  };
  await service.saveLockdown(guild.id, record);
  await service.audit({
    guildId: guild.id,
    actorId: options.actorId,
    actorType: options.actorId === guild.client.user?.id ? "BOT" : "USER",
    action: stillActive ? "security.lockdown.partial" : "security.lockdown.deactivate",
    targetType: "Guild",
    targetId: guild.id,
    reason: options.reason,
    before: { channels: existing.snapshot.channels.length },
    after: { channels: remaining.length, restored: changed },
  });

  logger.warn(
    { guildId: guild.id, restored: changed, remaining: remaining.length },
    stillActive ? "guild lockdown partially lifted" : "guild lockdown lifted",
  );
  return { changed, record };
}
