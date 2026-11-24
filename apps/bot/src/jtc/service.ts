import {
  ChannelType,
  PermissionsBitField,
  type Guild,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
  type VoiceChannel,
} from "discord.js";
import { JTC_DEFAULTS, jtcConfigSchema } from "@nujum/shared";
import { ApiActionError } from "../api/errors";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";
import type { ModuleService } from "../lib/modules";
import { assertHierarchy } from "../lib/permissions";
import type { AuditWrite } from "../security/types";
import { renderJtcName } from "./naming";
import type {
  JtcPresetInput,
  JtcPresetRecord,
  JtcRepository,
  JtcRoomRecord,
  JtcSettings,
} from "./types";
import { DEFAULT_JTC_SETTINGS } from "./types";
import {
  canManageRoom,
  canTransferRoom,
  toJtcActor,
  validateJtcAction,
  validateJtcPreset,
} from "./validation";
import { buildJtcPanelView } from "./views";

export interface JtcServiceOptions {
  ttlMs?: number;
  failureTtlMs?: number;
  cooldownMs?: number;
  now?: () => number;
}

export interface JtcPanelSendChannel {
  id: string;
  send(options: MessageCreateOptions): Promise<Message>;
  permissionsFor(member: GuildMember): { has(bits: bigint | readonly bigint[]): boolean } | null;
}

export interface JtcActionResult {
  room: JtcRoomRecord;
  detail?: string;
}

type AuditPort = (entry: AuditWrite) => Promise<void>;
type ModulePort = Pick<ModuleService, "isEnabled">;

interface JtcSnapshot {
  settings: JtcSettings;
  expiresAt: number;
}

/**
 * Cached JTC configuration and room lifecycle. Every control re-fetches the
 * room and the caller's Discord permissions; dashboard/DB flags are advisory
 * only and never grant authority.
 */
export class JtcService {
  private readonly cache = new Map<string, JtcSnapshot>();
  private readonly inflight = new Map<string, Promise<JtcSnapshot>>();
  private readonly cooldowns = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly failureTtlMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    private readonly repository: JtcRepository,
    private readonly modules: ModulePort,
    private readonly audit: AuditPort,
    private readonly logger: BotLogger,
    options: JtcServiceOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.failureTtlMs = options.failureTtlMs ?? 5_000;
    this.cooldownMs = options.cooldownMs ?? 10_000;
    this.now = options.now ?? (() => Date.now());
  }

  async settings(guildId: string): Promise<JtcSettings> {
    return (await this.snapshot(guildId)).settings;
  }

  invalidate(guildId?: string): void {
    if (guildId === undefined) {
      this.cache.clear();
      this.inflight.clear();
      this.cooldowns.clear();
      return;
    }
    this.cache.delete(guildId);
    this.inflight.delete(guildId);
    for (const key of this.cooldowns.keys()) {
      if (key.startsWith(`${guildId}:`)) this.cooldowns.delete(key);
    }
  }

  /** Cooldown is per guild and user so reconnect loops cannot spawn duplicates. */
  private allowCreation(guildId: string, userId: string): boolean {
    const key = `${guildId}:${userId}`;
    const until = this.cooldowns.get(key) ?? 0;
    if (until > this.now()) return false;
    this.cooldowns.set(key, this.now() + this.cooldownMs);
    return true;
  }

  async createRoom(guild: Guild, member: GuildMember): Promise<JtcRoomRecord> {
    if (!(await this.modules.isEnabled(guild.id, "JTC"))) {
      throw new ApiActionError("FORBIDDEN", "Join-to-Create is disabled on this server.", 403);
    }
    const settings = await this.settings(guild.id);
    if (!settings.enabled || !settings.generatorChannelId) {
      throw new ApiActionError("FORBIDDEN", "Join-to-Create is not set up on this server.", 403);
    }
    if (member.voice.channelId !== settings.generatorChannelId) {
      throw new ApiActionError("BAD_REQUEST", "Join the generator channel first.", 400);
    }
    if (!this.allowCreation(guild.id, member.id))
      return this.activeRoomOrThrow(guild.id, member.id);

    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (
      !me ||
      !me.permissions.has([
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.MoveMembers,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ])
    ) {
      this.cooldowns.delete(`${guild.id}:${member.id}`);
      throw new ApiActionError("FORBIDDEN", "I need voice channel management permissions.", 403);
    }

    const existing = await this.repository.loadRoomByOwner(guild.id, member.id);
    if (existing && !this.isRoomDeleted(guild, existing)) {
      return existing;
    }

    const name = renderJtcName(settings.nameTemplate, member.displayName);
    const view = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
    ];
    const everyone = guild.roles.everyone.id;
    const trusted = [...new Set([...settings.trustedRoleIds, me.id])];
    let channel: VoiceChannel;
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        ...(settings.categoryId ? { parent: settings.categoryId } : {}),
        userLimit: settings.defaultLimit,
        bitrate: settings.defaultBitrate * 1000,
        ...(settings.defaultRegion && settings.defaultRegion !== "auto"
          ? { rtcRegion: settings.defaultRegion }
          : {}),
        reason: `JTC room for ${member.user.tag}`,
        permissionOverwrites: [
          {
            id: everyone,
            deny: [PermissionsBitField.Flags.ManageChannels],
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
            ],
          },
          ...trusted.map((id) => ({
            id,
            allow: [...view, PermissionsBitField.Flags.ManageChannels],
          })),
          { id: member.id, allow: [...view, PermissionsBitField.Flags.ManageChannels] },
        ],
      });
    } catch (error) {
      this.cooldowns.delete(`${guild.id}:${member.id}`);
      throw error;
    }

    let room: JtcRoomRecord;
    try {
      room = await this.repository.createRoom({
        guildId: guild.id,
        channelId: channel.id,
        ownerId: member.id,
        locked: false,
        hidden: false,
        userLimit: settings.defaultLimit,
        bitrate: settings.defaultBitrate,
        region: settings.defaultRegion,
      });
    } catch (error) {
      await channel.delete("JTC database write failed").catch(() => undefined);
      this.cooldowns.delete(`${guild.id}:${member.id}`);
      throw error;
    }

    await member.voice.setChannel(channel).catch((error: unknown) => {
      this.logger.warn({ err: serializeError(error), guildId: guild.id }, "JTC member move failed");
    });
    await this.audit({
      guildId: guild.id,
      actorId: member.id,
      actorType: "USER",
      action: "jtc.room.create",
      targetType: "JtcRoom",
      targetId: room.id,
      after: { channelId: channel.id, name },
    });
    return room;
  }

  /** Deletes a managed room once its last member leaves. */
  async cleanupRoom(guild: Guild, channelId: string, remainingMembers?: number): Promise<void> {
    const room = await this.repository.loadRoomByChannel(guild.id, channelId);
    if (!room || room.deletedAt) return;
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    const members =
      remainingMembers ?? (channel && channel.isVoiceBased() ? channel.members.size : 0);
    if (members > 0) return;

    if (channel) await channel.delete("JTC room is empty").catch(() => undefined);
    await this.repository.markRoomDeleted(guild.id, channelId);
    await this.audit({
      guildId: guild.id,
      actorId: room.ownerId,
      actorType: "SYSTEM",
      action: "jtc.room.delete",
      targetType: "JtcRoom",
      targetId: room.id,
      after: { channelId, deletedAt: new Date().toISOString() },
    });
  }

  async markChannelDeleted(guildId: string, channelId: string): Promise<void> {
    await this.repository.markRoomDeleted(guildId, channelId);
  }

  async applyAction(guild: Guild, actorId: string, rawInput: unknown): Promise<JtcActionResult> {
    if (!(await this.modules.isEnabled(guild.id, "JTC"))) {
      throw new ApiActionError("FORBIDDEN", "Join-to-Create is disabled on this server.", 403);
    }
    const input = validateJtcAction(rawInput);
    const settings = await this.settings(guild.id);
    const actorMember = await this.member(guild, actorId);
    const actor = toJtcActor({
      id: actorId,
      roleIds: [...actorMember.roles.cache.keys()],
      permissions: actorMember.permissions,
      guildOwnerId: guild.ownerId,
      manageChannelsBit: PermissionsBitField.Flags.ManageChannels,
    });

    const room =
      input.action === "CLAIM"
        ? await this.claimableRoom(guild, actorMember, settings, actor)
        : await this.repository.loadRoomByOwner(guild.id, actorId);
    if (!room || room.deletedAt) {
      throw new ApiActionError("NOT_FOUND", "You do not have an active JTC room.", 404);
    }
    if (input.action !== "CLAIM" && !canManageRoom(room, settings, actor)) {
      throw new ApiActionError("FORBIDDEN", "You cannot manage this room.", 403);
    }

    const channel =
      guild.channels.cache.get(room.channelId) ??
      (await guild.channels.fetch(room.channelId).catch(() => null));
    if (!channel || !channel.isVoiceBased()) {
      throw new ApiActionError("NOT_FOUND", "Your JTC voice channel no longer exists.", 404);
    }
    const voice = channel as VoiceChannel;
    const patch: Partial<JtcRoomRecord> = {};
    let detail: string | undefined;

    if (input.userId) {
      const target = await this.member(guild, input.userId);
      const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      if (!me) throw new ApiActionError("INTERNAL", "Bot member is unavailable.", 503);
      assertHierarchy({ guild, actor: actorMember, target, me });
    }

    switch (input.action) {
      case "LOCK":
        await voice.permissionOverwrites.edit(guild.roles.everyone.id, {
          Connect: false,
          Speak: false,
        });
        patch.locked = true;
        break;
      case "UNLOCK":
        await voice.permissionOverwrites.edit(guild.roles.everyone.id, {
          Connect: true,
          Speak: true,
        });
        patch.locked = false;
        break;
      case "HIDE":
        await voice.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
        patch.hidden = true;
        break;
      case "UNHIDE":
        await voice.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: true });
        patch.hidden = false;
        break;
      case "RENAME":
        await voice.setName(input.name ?? "Room", "JTC rename");
        break;
      case "LIMIT":
        await voice.setUserLimit(input.value ?? 0);
        patch.userLimit = input.value ?? 0;
        break;
      case "BITRATE":
        await voice.setBitrate((input.value ?? JTC_DEFAULTS.defaultBitrate) * 1000);
        patch.bitrate = input.value ?? JTC_DEFAULTS.defaultBitrate;
        break;
      case "REGION":
        await voice.setRTCRegion(input.region === "auto" ? null : (input.region ?? null));
        patch.region = input.region ?? null;
        break;
      case "KICK":
        if (input.userId) {
          const target = await this.member(guild, input.userId);
          await target.voice.setChannel(null, "Kicked from JTC room");
        }
        break;
      case "BAN":
        if (input.userId) {
          const target = await this.member(guild, input.userId);
          await voice.permissionOverwrites.edit(input.userId, {
            Connect: false,
            ViewChannel: false,
          });
          await target.voice.setChannel(null, "Banned from JTC room");
        }
        break;
      case "PERMIT":
        if (input.userId) {
          await voice.permissionOverwrites.edit(input.userId, {
            Connect: true,
            Speak: true,
            ViewChannel: true,
          });
        }
        break;
      case "TRANSFER":
        if (!canTransferRoom(room, actor) || !input.userId) {
          throw new ApiActionError(
            "FORBIDDEN",
            "Only the owner or staff can transfer a room.",
            403,
          );
        }
        patch.ownerId = input.userId;
        break;
      case "CLAIM":
        patch.ownerId = actorId;
        break;
      case "INVITE": {
        const invite = await voice.createInvite({
          maxAge: 60 * 60,
          maxUses: 0,
          reason: `JTC invite by ${actorId}`,
        });
        detail = invite.url;
        break;
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.repository.updateRoom(guild.id, room.id, patch);
    }
    await this.audit({
      guildId: guild.id,
      actorId,
      actorType: "USER",
      action: `jtc.${input.action.toLowerCase()}`,
      targetType: "JtcRoom",
      targetId: room.id,
      after: { ...patch, ...(input.userId ? { userId: input.userId } : {}) },
    });
    return { room: { ...room, ...patch }, ...(detail ? { detail } : {}) };
  }

  /** Applies a user's default (or named) preset to their own room. */
  async applyPreset(guild: Guild, actorId: string, name?: string): Promise<JtcActionResult> {
    if (!(await this.modules.isEnabled(guild.id, "JTC"))) {
      throw new ApiActionError("FORBIDDEN", "Join-to-Create is disabled on this server.", 403);
    }
    const presets = await this.repository.loadPresets(guild.id, actorId);
    const preset =
      (name ? presets.find((entry) => entry.name === name) : undefined) ??
      presets.find((entry) => entry.isDefault);
    if (!preset) throw new ApiActionError("NOT_FOUND", "No preset found.", 404);
    const room = await this.repository.loadRoomByOwner(guild.id, actorId);
    if (!room || room.deletedAt) {
      throw new ApiActionError("NOT_FOUND", "You do not have an active JTC room.", 404);
    }
    const limited = await this.applyAction(guild, actorId, {
      action: "LIMIT",
      value: preset.userLimit,
    });
    const changes: unknown[] = [];
    if (preset.locked && !room.locked) changes.push({ action: "LOCK" as const });
    if (preset.hidden && !room.hidden) changes.push({ action: "HIDE" as const });
    if (preset.bitrate !== room.bitrate) {
      changes.push({ action: "BITRATE" as const, value: preset.bitrate });
    }
    if (preset.region && preset.region !== room.region) {
      changes.push({ action: "REGION" as const, region: preset.region });
    }
    for (const change of changes) await this.applyAction(guild, actorId, change);
    return limited;
  }

  async savePreset(guild: Guild, userId: string, rawInput: unknown): Promise<JtcPresetRecord> {
    const input: JtcPresetInput = validateJtcPreset(rawInput);
    return this.repository.savePreset(guild.id, userId, input);
  }

  async listPresets(guildId: string, userId: string): Promise<readonly JtcPresetRecord[]> {
    return this.repository.loadPresets(guildId, userId);
  }

  async deletePreset(guildId: string, userId: string, name: string): Promise<void> {
    await this.repository.deletePreset(guildId, userId, name);
  }

  async publishPanel(
    guildId: string,
    actorId: string,
    options: { guild: Guild; channel?: JtcPanelSendChannel },
  ): Promise<{ messageId: string; channelId: string }> {
    if (options.guild.id !== guildId)
      throw new ApiActionError("BAD_REQUEST", "Guild mismatch.", 400);
    if (!(await this.modules.isEnabled(guildId, "JTC"))) {
      throw new ApiActionError("FORBIDDEN", "Join-to-Create is disabled on this server.", 403);
    }
    const settings = await this.settings(guildId);
    if (!settings.enabled) {
      throw new ApiActionError("FORBIDDEN", "Join-to-Create is not set up on this server.", 403);
    }
    const channelId = settings.interfaceChannelId ?? settings.panelChannelId;
    if (!channelId && !options.channel) {
      throw new ApiActionError("BAD_REQUEST", "Set a JTC interface channel first.", 400);
    }
    const channel =
      options.channel ?? (await this.resolveSendChannel(options.guild, channelId as string));
    const me =
      options.guild.members.me ?? (await options.guild.members.fetchMe().catch(() => null));
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      throw new ApiActionError(
        "FORBIDDEN",
        "I need Manage Channels to publish the JTC panel.",
        403,
      );
    }
    if (
      !channel
        .permissionsFor(me)
        ?.has([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
        ])
    ) {
      throw new ApiActionError("FORBIDDEN", "I cannot write in that channel.", 403);
    }
    const view = buildJtcPanelView(guildId, actorId, settings);
    try {
      const message = await channel.send({
        embeds: view.embeds,
        components: view.components,
        allowedMentions: { parse: [], repliedUser: false },
      });
      await this.audit({
        guildId,
        actorId,
        actorType: "USER",
        action: "jtc.panel.publish",
        targetType: "Guild",
        targetId: guildId,
        after: { channelId: channel.id, messageId: message.id },
      });
      return { messageId: message.id, channelId: channel.id };
    } catch (error) {
      this.logger.error({ err: serializeError(error), guildId }, "JTC panel publish failed");
      throw new ApiActionError("INTERNAL", "Discord rejected the JTC panel.", 502);
    }
  }

  async stats(guildId: string, ownerId: string): Promise<{ rooms: number; presets: number }> {
    const [room, presets] = await Promise.all([
      this.repository.loadRoomByOwner(guildId, ownerId),
      this.repository.loadPresets(guildId, ownerId),
    ]);
    return { rooms: room ? 1 : 0, presets: presets.length };
  }

  private async member(guild: Guild, userId: string): Promise<GuildMember> {
    const member =
      guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (!member)
      throw new ApiActionError("NOT_FOUND", "That member is no longer in this server.", 404);
    return member;
  }

  private async activeRoomOrThrow(guildId: string, ownerId: string): Promise<JtcRoomRecord> {
    const room = await this.repository.loadRoomByOwner(guildId, ownerId);
    if (!room || room.deletedAt) {
      throw new ApiActionError("BAD_REQUEST", "Please wait before creating another room.", 400);
    }
    return room;
  }

  private isRoomDeleted(guild: Guild, room: JtcRoomRecord): boolean {
    if (room.deletedAt) return true;
    const channel = guild.channels.cache.get(room.channelId);
    return !channel;
  }

  private async claimableRoom(
    guild: Guild,
    member: GuildMember,
    settings: JtcSettings,
    actor: ReturnType<typeof toJtcActor>,
  ): Promise<JtcRoomRecord | null> {
    if (!member.voice.channelId) return null;
    const room = await this.repository.loadRoomByChannel(guild.id, member.voice.channelId);
    if (!room || room.deletedAt) return null;
    const previous = await guild.members.fetch(room.ownerId).catch(() => null);
    if (previous && !canTransferRoom(room, actor)) return null;
    return room;
  }

  private async resolveSendChannel(guild: Guild, channelId: string): Promise<JtcPanelSendChannel> {
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      throw new ApiActionError("NOT_FOUND", "JTC interface channel not found.", 404);
    }
    return channel;
  }

  private async snapshot(guildId: string): Promise<JtcSnapshot> {
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > this.now()) return cached;
    const pending = this.inflight.get(guildId);
    if (pending) return pending;

    const load = (async (): Promise<JtcSnapshot> => {
      try {
        const row = await this.repository.loadSettings(guildId);
        const parsed = row ? jtcConfigSchema.safeParse(row) : null;
        const settings: JtcSettings = parsed?.success
          ? {
              enabled: parsed.data.enabled,
              generatorChannelId: parsed.data.generatorChannelId ?? null,
              categoryId: parsed.data.categoryId ?? null,
              nameTemplate: parsed.data.nameTemplate,
              defaultLimit: parsed.data.defaultLimit,
              defaultBitrate: parsed.data.defaultBitrate,
              defaultRegion: parsed.data.defaultRegion,
              panelChannelId: parsed.data.panelChannelId ?? null,
              interfaceChannelId: parsed.data.interfaceChannelId ?? null,
              trustedRoleIds: [...parsed.data.trustedRoleIds],
            }
          : { ...DEFAULT_JTC_SETTINGS };
        const snapshot: JtcSnapshot = {
          settings,
          expiresAt: this.now() + this.ttlMs,
        };
        this.store(guildId, snapshot);
        return snapshot;
      } catch (error) {
        this.logger.warn(
          { err: serializeError(error), guildId },
          "JTC config unavailable; using safe defaults",
        );
        const snapshot: JtcSnapshot = {
          settings: { ...DEFAULT_JTC_SETTINGS },
          expiresAt: this.now() + this.failureTtlMs,
        };
        this.store(guildId, snapshot);
        return snapshot;
      }
    })().finally(() => this.inflight.delete(guildId));

    this.inflight.set(guildId, load);
    return load;
  }

  private store(guildId: string, snapshot: JtcSnapshot): void {
    this.cache.delete(guildId);
    this.cache.set(guildId, snapshot);
  }
}
