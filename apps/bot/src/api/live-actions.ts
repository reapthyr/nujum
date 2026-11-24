import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
} from "discord.js";
import type {
  AnnouncementInput,
  BotActionResult,
  BotGuildSnapshot,
  LockdownInput,
  PublishVerificationInput,
  SendMessageInput,
} from "@nujum/shared";
import type { NujumClient } from "../client/NujumClient";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";
import { activateLockdown, deactivateLockdown } from "../security/lockdown";
import { verificationPanel } from "../security/verification/views";

/** Text-based guild channels that can actually send (excludes partial DMs). */
interface SendableChannel {
  id: string;
  send(options: MessageCreateOptions): Promise<Message>;
}

export class ApiActionError extends Error {
  constructor(
    readonly code:
      "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "GUILD_NOT_FOUND" | "RATE_LIMITED" | "INTERNAL",
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "ApiActionError";
  }
}

export interface LiveActions {
  snapshot(guildId: string): Promise<BotGuildSnapshot>;
  sendMessage(guildId: string, input: SendMessageInput, actorId: string): Promise<BotActionResult>;
  announcement(
    guildId: string,
    input: AnnouncementInput,
    actorId: string,
  ): Promise<BotActionResult>;
  publishVerificationPanel(
    guildId: string,
    input: PublishVerificationInput,
    actorId: string,
  ): Promise<BotActionResult>;
  setLockdown(guildId: string, input: LockdownInput, actorId: string): Promise<BotActionResult>;
}

function actionResult(
  type: BotActionResult["type"],
  message?: Message | null,
  detail?: string,
): BotActionResult {
  return {
    type,
    status: "SENT",
    ...(message ? { messageId: message.id } : {}),
    ...(detail ? { detail } : {}),
  };
}

export class DiscordLiveActions implements LiveActions {
  constructor(
    private readonly client: NujumClient,
    private readonly logger: BotLogger,
  ) {}

  private async guild(guildId: string): Promise<Guild> {
    const guild =
      this.client.guilds.cache.get(guildId) ??
      (await this.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) throw new ApiActionError("GUILD_NOT_FOUND", "The bot is not in that guild.", 404);
    return guild;
  }

  private async me(guild: Guild): Promise<GuildMember> {
    const member = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!member) throw new ApiActionError("INTERNAL", "Bot member is unavailable.", 503);
    return member;
  }

  private async textChannel(
    guild: Guild,
    channelId: string,
    requireEmbedLinks: boolean,
  ): Promise<{ channel: SendableChannel; me: GuildMember }> {
    const channel: GuildBasedChannel | null =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      throw new ApiActionError("NOT_FOUND", "Text channel not found.", 404);
    }

    const me = await this.me(guild);
    const required =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      (requireEmbedLinks ? PermissionFlagsBits.EmbedLinks : 0n);
    if (!channel.permissionsFor(me)?.has(required)) {
      throw new ApiActionError("FORBIDDEN", "The bot cannot write in that channel.", 403);
    }
    return { channel: channel as unknown as SendableChannel, me };
  }

  private async audit(
    guildId: string,
    actorId: string,
    action: string,
    targetId: string | null,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.client.security.audit({
      guildId,
      actorId,
      actorType: "DASHBOARD",
      action,
      targetType: "Discord",
      targetId,
      after,
    });
  }

  async snapshot(guildId: string): Promise<BotGuildSnapshot> {
    const guild = await this.guild(guildId);
    const me = await this.me(guild);
    const channels: BotGuildSnapshot["channels"] = [...guild.channels.cache.values()]
      .filter((channel) => channel.isTextBased() || channel.isVoiceBased())
      .slice(0, 500)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.isTextBased() ? "text" : "voice",
        parentId: channel.parentId ?? null,
      }));
    const roles = [...guild.roles.cache.values()].slice(0, 500).map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
    }));

    return {
      online: this.client.isReady(),
      guild: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        iconUrl: guild.iconURL({ size: 128 }) ?? null,
        ownerId: guild.ownerId,
        botPermissions: me.permissions.toArray().slice(0, 60),
      },
      channels,
      roles,
    };
  }

  async sendMessage(
    guildId: string,
    input: SendMessageInput,
    actorId: string,
  ): Promise<BotActionResult> {
    const guild = await this.guild(guildId);
    const { channel } = await this.textChannel(
      guild,
      input.channelId,
      Boolean(input.embeds?.length),
    );
    try {
      const message = await channel.send({
        ...(input.content ? { content: input.content } : {}),
        ...(input.embeds ? { embeds: input.embeds } : {}),
        allowedMentions: { parse: [], repliedUser: false },
      });
      await this.audit(guildId, actorId, "bot.message.send", channel.id, {
        channelId: channel.id,
        messageId: message.id,
      });
      return actionResult("SEND_MESSAGE", message);
    } catch (error) {
      this.logger.error({ err: serializeError(error), guildId }, "bot message send failed");
      throw new ApiActionError("INTERNAL", "Discord rejected the message.", 502);
    }
  }

  async announcement(
    guildId: string,
    input: AnnouncementInput,
    actorId: string,
  ): Promise<BotActionResult> {
    const guild = await this.guild(guildId);
    const { channel } = await this.textChannel(guild, input.channelId, Boolean(input.embed));
    if (input.mentionEveryone) {
      const me = await this.me(guild);
      if (!me.permissions.has(PermissionFlagsBits.MentionEveryone)) {
        throw new ApiActionError("FORBIDDEN", "The bot cannot mention everyone.", 403);
      }
    }

    try {
      const message = await channel.send({
        ...(input.content ? { content: input.content } : {}),
        ...(input.embed ? { embeds: [input.embed] } : {}),
        allowedMentions: {
          parse: input.mentionEveryone ? ["everyone"] : [],
          repliedUser: false,
        },
      });
      await this.audit(guildId, actorId, "bot.announcement.send", channel.id, {
        channelId: channel.id,
        messageId: message.id,
        mentionEveryone: input.mentionEveryone,
      });
      return actionResult("ANNOUNCEMENT", message);
    } catch (error) {
      this.logger.error({ err: serializeError(error), guildId }, "bot announcement failed");
      throw new ApiActionError("INTERNAL", "Discord rejected the announcement.", 502);
    }
  }

  async publishVerificationPanel(
    guildId: string,
    input: PublishVerificationInput,
    actorId: string,
  ): Promise<BotActionResult> {
    if (!(await this.client.modules.isEnabled(guildId, "VERIFICATION"))) {
      throw new ApiActionError("FORBIDDEN", "Verification is disabled.", 403);
    }
    const settings = await this.client.verification.settings(guildId);
    const channelId = input.channelId ?? settings.channelId;
    if (!channelId) {
      throw new ApiActionError("BAD_REQUEST", "Set a verification channel first.", 400);
    }

    const guild = await this.guild(guildId);
    const { channel } = await this.textChannel(guild, channelId, true);
    const panel = verificationPanel(settings, guildId, guild.ownerId);
    try {
      const message = await channel.send({
        embeds: panel.embeds,
        components: panel.components,
        allowedMentions: { parse: [], repliedUser: false },
      });
      await this.audit(guildId, actorId, "verification.panel.publish", channel.id, {
        channelId: channel.id,
        messageId: message.id,
      });
      return actionResult("PUBLISH_VERIFICATION_PANEL", message);
    } catch (error) {
      this.logger.error(
        { err: serializeError(error), guildId },
        "verification panel publish failed",
      );
      throw new ApiActionError("INTERNAL", "Discord rejected the verification panel.", 502);
    }
  }

  async setLockdown(
    guildId: string,
    input: LockdownInput,
    actorId: string,
  ): Promise<BotActionResult> {
    const guild = await this.guild(guildId);
    const me = await this.me(guild);
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new ApiActionError("FORBIDDEN", "The bot cannot manage channel overwrites.", 403);
    }

    const reason = input.reason ?? (input.active ? "Dashboard lockdown" : "Dashboard unlock");
    try {
      const result = input.active
        ? await activateLockdown(guild, this.client.security, this.logger, {
            reason,
            activatedBy: actorId,
          })
        : await deactivateLockdown(guild, this.client.security, this.logger, {
            reason,
            actorId,
          });
      await this.audit(guildId, actorId, "security.lockdown.dashboard", null, {
        active: result.record.active,
        changed: result.changed,
        reason,
      });
      return actionResult("SET_LOCKDOWN", null, `${result.changed} channel(s) updated`);
    } catch (error) {
      this.logger.error({ err: serializeError(error), guildId }, "dashboard lockdown failed");
      throw new ApiActionError("INTERNAL", "Lockdown could not be applied.", 502);
    }
  }
}
