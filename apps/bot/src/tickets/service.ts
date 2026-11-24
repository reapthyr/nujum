import {
  ChannelType,
  PermissionsBitField,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type MessageCreateOptions,
} from "discord.js";
import {
  AUDIT_ACTIONS,
  TICKET_DEFAULTS,
  ticketActionSchema,
  ticketBlacklistSchema,
  ticketRatingSchema,
  type BotActionResult,
  type PublishTicketPanelInput,
  type TicketAction,
  type TicketPriority,
} from "@nujum/shared";
import { ApiActionError } from "../api/errors";
import { serializeError } from "../lib/errors";
import { baseEmbed, truncate } from "../lib/embeds";
import type { BotLogger } from "../lib/logger";
import { assertHierarchy } from "../lib/permissions";
import type { ModuleService } from "../lib/modules";
import type { AuditWrite } from "../security/types";
import { formatTicketName } from "./naming";
import { buildTranscriptHtml } from "./transcript";
import { parseTicketPanelInput } from "./validation";
import type {
  TicketBlacklistEntry,
  TicketCategoryRecord,
  TicketPanelEmbed,
  TicketPanelRecord,
  TicketRecord,
  TicketRepository,
  TicketSettings,
  TicketStats,
} from "./types";
import { DEFAULT_TICKET_SETTINGS } from "./types";
import { buildTicketPanelView, buildTicketWelcomeView, type TicketPanelView } from "./views";

export interface TicketSendChannel {
  id: string;
  send(options: MessageCreateOptions): Promise<Message>;
  permissionsFor(member: GuildMember): { has(bits: bigint | readonly bigint[]): boolean } | null;
}

export interface TicketActionRequest {
  channelId?: string;
  ticketId?: string;
  action: TicketAction;
  userId?: string;
  name?: string;
  priority?: TicketPriority;
  reason?: string;
}

export interface PublishTicketPanelOptions {
  guild: Guild;
  /** Preview target supplied by a slash command; the API never previews. */
  previewChannel?: TicketSendChannel;
  /** Unsaved panel shape for previews; the API never previews. */
  previewPanel?: {
    type: "BUTTONS" | "DROPDOWN";
    embed: TicketPanelEmbed;
    categoryIds: readonly string[];
  };
  panelId?: string;
}

export interface TicketServiceOptions {
  ttlMs?: number;
  failureTtlMs?: number;
  now?: () => number;
}

interface TicketSnapshot {
  settings: TicketSettings;
  categories: TicketCategoryRecord[];
  allCategories: TicketCategoryRecord[];
  panels: Map<string, TicketPanelRecord | null>;
  expiresAt: number;
}

type AuditPort = (entry: AuditWrite) => Promise<void>;
type ModulePort = Pick<ModuleService, "isEnabled">;

const BOT_PANEL_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
];

function hasRole(member: GuildMember, roleIds: readonly string[]): boolean {
  return roleIds.some((id) => member.roles.cache.has(id));
}

async function fetchMember(guild: Guild, userId: string): Promise<GuildMember> {
  const member =
    guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member)
    throw new ApiActionError("NOT_FOUND", "That member is no longer in this server.", 404);
  return member;
}

async function sendableChannel(guild: Guild, channelId: string): Promise<TicketSendChannel> {
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
    throw new ApiActionError("NOT_FOUND", "Text channel not found.", 404);
  }
  return channel;
}

/**
 * Cached ticket configuration plus all ticket lifecycle operations. Discord
 * permissions and hierarchy are re-checked on every mutation; cached database
 * values are never treated as proof of authority.
 */
export class TicketService {
  private readonly cache = new Map<string, TicketSnapshot>();
  private readonly inflight = new Map<string, Promise<TicketSnapshot>>();
  private readonly panelInflight = new Map<string, Promise<TicketPanelRecord | null>>();
  private readonly ttlMs: number;
  private readonly failureTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly repository: TicketRepository,
    private readonly modules: ModulePort,
    private readonly audit: AuditPort,
    private readonly logger: BotLogger,
    options: TicketServiceOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.failureTtlMs = options.failureTtlMs ?? 5_000;
    this.now = options.now ?? (() => Date.now());
  }

  async settings(guildId: string): Promise<TicketSettings> {
    return (await this.snapshot(guildId)).settings;
  }

  /** Enabled categories by default; `includeDisabled` is for admin tooling. */
  async categories(
    guildId: string,
    includeDisabled = false,
  ): Promise<readonly TicketCategoryRecord[]> {
    const snapshot = await this.snapshot(guildId);
    return includeDisabled ? snapshot.allCategories : snapshot.categories;
  }

  async panel(guildId: string, panelId?: string): Promise<TicketPanelRecord | null> {
    const snapshot = await this.snapshot(guildId);
    const key = panelId ?? "latest";
    if (snapshot.panels.has(key)) return snapshot.panels.get(key) ?? null;

    const pending = this.panelInflight.get(`${guildId}:panel:${key}`);
    if (pending) return pending;

    const load = this.repository
      .loadPanel(guildId, panelId)
      .then((panel) => {
        const current = this.cache.get(guildId);
        if (current) current.panels.set(key, panel);
        return panel;
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { err: serializeError(error), guildId, panelId: panelId ?? null },
          "ticket panel unavailable",
        );
        return null;
      })
      .finally(() => this.panelInflight.delete(`${guildId}:panel:${key}`));
    this.panelInflight.set(`${guildId}:panel:${key}`, load);
    return load;
  }

  invalidate(guildId?: string): void {
    if (guildId === undefined) {
      this.cache.clear();
      this.inflight.clear();
      this.panelInflight.clear();
      return;
    }
    this.cache.delete(guildId);
    this.inflight.delete(guildId);
    for (const key of this.panelInflight.keys()) {
      if (key.startsWith(`${guildId}:`)) this.panelInflight.delete(key);
    }
  }

  async savePanel(
    guildId: string,
    input: {
      channelId: string;
      type: "BUTTONS" | "DROPDOWN";
      embed: TicketPanelEmbed;
      categoryIds: readonly string[];
    },
    actorId: string,
  ): Promise<TicketPanelRecord> {
    const parsed = parseTicketPanelInput({
      channelId: input.channelId,
      type: input.type,
      embed: input.embed,
      categoryIds: [...input.categoryIds],
    });
    const panel = await this.repository.upsertPanel(
      guildId,
      {
        channelId: parsed.channelId,
        type: parsed.type,
        embed: parsed.embed,
        categoryIds: parsed.categoryIds,
      },
      actorId,
    );
    this.invalidate(guildId);
    return panel;
  }

  /** Pure view builder; also used by the preview path. */
  async buildPanel(guildId: string, userId: string, panelId?: string): Promise<TicketPanelView> {
    const panel = await this.panel(guildId, panelId);
    const categories = await this.categories(guildId);
    const selected = panel
      ? categories.filter((category) => panel.categoryIds.includes(category.id))
      : categories;
    if (selected.length === 0) {
      throw new ApiActionError(
        "BAD_REQUEST",
        "Configure a panel and at least one enabled category first.",
        400,
      );
    }
    const viewPanel = panel ?? {
      guildId,
      channelId: "",
      type: "BUTTONS" as const,
      embed: { title: "Support tickets", description: "Choose a category below." },
    };
    return buildTicketPanelView(viewPanel, selected, userId);
  }

  async publish(
    guildId: string,
    input: PublishTicketPanelInput,
    actorId: string,
    options: PublishTicketPanelOptions,
  ): Promise<BotActionResult> {
    if (options.guild.id !== guildId) {
      throw new ApiActionError("BAD_REQUEST", "Guild mismatch.", 400);
    }
    if (!(await this.modules.isEnabled(guildId, "TICKETS"))) {
      throw new ApiActionError("FORBIDDEN", "Tickets are disabled on this server.", 403);
    }
    const settings = await this.settings(guildId);
    if (!settings.enabled) {
      throw new ApiActionError("FORBIDDEN", "Ticket configuration is disabled.", 403);
    }

    const previewPanel = input.preview ? options.previewPanel : undefined;
    const panel = previewPanel ? null : await this.panel(guildId, options.panelId);
    const categories = await this.categories(guildId);
    const selected = previewPanel
      ? categories.filter((category) => previewPanel.categoryIds.includes(category.id))
      : panel
        ? categories.filter((category) => panel.categoryIds.includes(category.id))
        : categories;
    if (!panel && selected.length === 0) {
      throw new ApiActionError(
        "BAD_REQUEST",
        "Configure a panel or at least one enabled ticket category first.",
        400,
      );
    }

    const channelId = input.channelId ?? settings.panelChannelId ?? panel?.channelId;
    if (input.preview && !options.previewChannel) {
      throw new ApiActionError("BAD_REQUEST", "Preview requires a target channel.", 400);
    }
    if (!input.preview && !channelId) {
      throw new ApiActionError("BAD_REQUEST", "Set a ticket panel channel first.", 400);
    }

    const channel = input.preview
      ? (options.previewChannel as TicketSendChannel)
      : await sendableChannel(options.guild, channelId as string);
    const me =
      options.guild.members.me ?? (await options.guild.members.fetchMe().catch(() => null));
    if (!me) throw new ApiActionError("INTERNAL", "Bot member is unavailable.", 503);
    if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      throw new ApiActionError("FORBIDDEN", "I need Manage Channels to publish panels.", 403);
    }
    if (!channel.permissionsFor(me)?.has(BOT_PANEL_PERMISSIONS)) {
      throw new ApiActionError("FORBIDDEN", "I cannot write and embed in that channel.", 403);
    }

    const view = buildTicketPanelView(
      previewPanel
        ? { guildId, channelId: channel.id, ...previewPanel }
        : (panel ?? {
            guildId,
            channelId: channel.id,
            type: "BUTTONS",
            embed: { title: "Support tickets", description: "Choose a category below." },
          }),
      selected,
      actorId,
    );
    try {
      const message = await channel.send({
        embeds: view.embeds,
        components: view.components,
        allowedMentions: { parse: [], repliedUser: false },
      });
      if (!input.preview && panel) await this.repository.markPanelPublished(panel.id, message.id);
      await this.audit({
        guildId,
        actorId,
        actorType: actorId === options.guild.ownerId ? "USER" : "DASHBOARD",
        action: AUDIT_ACTIONS.ticketPanelPublish,
        targetType: "TicketPanel",
        targetId: panel?.id ?? null,
        after: { channelId: channel.id, messageId: message.id, preview: input.preview },
      });
      return {
        type: "PUBLISH_TICKET_PANEL",
        status: "SENT",
        messageId: message.id,
      };
    } catch (error) {
      this.logger.error(
        { err: serializeError(error), guildId, channelId: channel.id },
        "ticket panel publish failed",
      );
      throw new ApiActionError("INTERNAL", "Discord rejected the ticket panel.", 502);
    }
  }

  async createTicket(
    guild: Guild,
    categoryId: string,
    openerId: string,
    actorId: string,
  ): Promise<TicketRecord> {
    if (!(await this.modules.isEnabled(guild.id, "TICKETS"))) {
      throw new ApiActionError("FORBIDDEN", "Tickets are disabled on this server.", 403);
    }
    const settings = await this.settings(guild.id);
    if (!settings.enabled) {
      throw new ApiActionError("FORBIDDEN", "Ticket configuration is disabled.", 403);
    }

    const category = (await this.categories(guild.id, true)).find(
      (entry) => entry.id === categoryId,
    );
    if (!category || !category.enabled) {
      throw new ApiActionError("NOT_FOUND", "That ticket category is not available.", 404);
    }
    if (await this.repository.isBlacklisted(guild.id, openerId, new Date())) {
      throw new ApiActionError("FORBIDDEN", "You cannot open tickets on this server.", 403);
    }
    const open = await this.repository.countOpenByUser(guild.id, openerId);
    if (open >= settings.maxOpenPerUser) {
      throw new ApiActionError(
        "FORBIDDEN",
        `You already have ${open} open ticket(s); the limit is ${settings.maxOpenPerUser}.`,
        403,
      );
    }

    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      throw new ApiActionError(
        "FORBIDDEN",
        "I need Manage Channels to create ticket channels.",
        403,
      );
    }
    const number = await this.repository.nextTicketNumber(guild.id);
    const name = formatTicketName(settings.namingFormat, number);
    const supportRoles = [
      ...new Set([...settings.supportRoleIds, ...category.supportRoleIds]),
    ].slice(0, TICKET_DEFAULTS.maxSupportRoles);
    const everyone = guild.roles.everyone.id;
    const view = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.ReadMessageHistory,
    ];

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      ...(category.discordCategoryId ? { parent: category.discordCategoryId } : {}),
      reason: `Ticket #${number} opened by ${openerId}`,
      permissionOverwrites: [
        { id: everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
          id: openerId,
          allow: [
            ...view,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AttachFiles,
          ],
        },
        {
          id: me.id,
          allow: [
            ...view,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
          ],
        },
        ...supportRoles.map((roleId) => ({
          id: roleId,
          allow: [
            ...view,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageMessages,
          ],
        })),
      ],
    });

    let ticket: TicketRecord;
    try {
      ticket = await this.repository.createTicket({
        guildId: guild.id,
        number,
        channelId: channel.id,
        categoryId: category.id,
        openerId,
      });
    } catch (error) {
      await channel.delete("Ticket database write failed").catch(() => undefined);
      this.logger.error(
        { err: serializeError(error), guildId: guild.id, categoryId },
        "ticket database write failed; channel rolled back",
      );
      throw error;
    }

    const welcome = buildTicketWelcomeView({
      guildId: guild.id,
      ticketId: ticket.id,
      userId: openerId,
      categoryName: category.name,
      number,
      ratingEnabled: settings.ratingEnabled,
    });
    await channel
      .send({
        embeds: welcome.embeds,
        components: welcome.components,
        allowedMentions: { parse: [], repliedUser: false },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          { err: serializeError(error), guildId: guild.id },
          "ticket welcome failed",
        );
      });

    await this.audit({
      guildId: guild.id,
      actorId,
      actorType: "USER",
      action: "tickets.create",
      targetType: "Ticket",
      targetId: ticket.id,
      after: { number, channelId: channel.id, categoryId: category.id, openerId },
    });
    return ticket;
  }

  /** Parses and validates with the shared schema before touching Discord or the DB. */
  async executeAction(
    guild: Guild,
    actorId: string,
    request: TicketActionRequest,
  ): Promise<TicketRecord> {
    const action = ticketActionSchema.parse({
      action: request.action,
      ...(request.userId ? { userId: request.userId } : {}),
      ...(request.name ? { name: request.name } : {}),
      ...(request.priority ? { priority: request.priority } : {}),
      ...(request.reason ? { reason: request.reason } : {}),
    });
    const ticket = request.ticketId
      ? await this.repository.findTicketById(guild.id, request.ticketId)
      : request.channelId
        ? await this.repository.findTicket(guild.id, request.channelId)
        : null;
    if (!ticket) throw new ApiActionError("NOT_FOUND", "That ticket no longer exists.", 404);

    const isOpener = ticket.openerId === actorId;
    const settings = await this.settings(guild.id);
    const actor = await fetchMember(guild, actorId);
    const roles = [
      ...new Set([
        ...settings.supportRoleIds,
        ...((await this.categories(guild.id, true)).find((entry) => entry.id === ticket.categoryId)
          ?.supportRoleIds ?? []),
      ]),
    ];
    const isStaff =
      actor.permissions.has(PermissionsBitField.Flags.ManageChannels) || hasRole(actor, roles);
    const openerAllowed = action.action === "CLOSE" && isOpener;
    if (!isStaff && !openerAllowed) {
      throw new ApiActionError("FORBIDDEN", "You cannot manage this ticket.", 403);
    }

    if (action.userId) {
      const target = await fetchMember(guild, action.userId);
      const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      if (!me) throw new ApiActionError("INTERNAL", "Bot member is unavailable.", 503);
      assertHierarchy({ guild, actor, target, me });
    }

    const channel =
      guild.channels.cache.get(ticket.channelId) ??
      (await guild.channels.fetch(ticket.channelId).catch(() => null));
    const textChannel = channel?.isTextBased() ? channel : null;
    const patch: Record<string, unknown> = { lastActivityAt: new Date() };

    switch (action.action) {
      case "CLAIM":
        if (!isStaff) throw new ApiActionError("FORBIDDEN", "Only staff can claim tickets.", 403);
        if (ticket.claimedBy) {
          throw new ApiActionError("CONFLICT", "This ticket is already claimed.", 409);
        }
        patch.status = "CLAIMED";
        patch.claimedBy = actorId;
        break;
      case "CLOSE":
        patch.status = "CLOSED";
        patch.closedBy = actorId;
        patch.closedAt = new Date();
        patch.closeReason = action.reason ?? null;
        break;
      case "ADD_USER":
        if (!action.userId) break;
        await this.repository.addParticipant(ticket.id, action.userId, actorId);
        if (channel?.isTextBased() && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites
            .edit(action.userId, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
            })
            .catch(() => undefined);
        }
        break;
      case "REMOVE_USER":
        if (!action.userId) break;
        await this.repository.removeParticipant(ticket.id, action.userId);
        if (channel?.isTextBased() && "permissionOverwrites" in channel) {
          await channel.permissionOverwrites.delete(action.userId).catch(() => undefined);
        }
        break;
      case "RENAME":
        if (channel && "setName" in channel) {
          await channel.setName(
            truncate(action.name ?? `ticket-${ticket.number}`, 100),
            "Ticket rename",
          );
        }
        break;
      case "TRANSFER":
        if (!action.userId) break;
        patch.status = "CLAIMED";
        patch.claimedBy = action.userId;
        break;
      case "PRIORITY":
        patch.priority = action.priority ?? "NORMAL";
        break;
      case "NOTE":
        await this.repository.addNote(ticket.id, actorId, action.reason ?? "");
        break;
      case "CALL_STAFF":
        if (channel && "send" in channel && typeof channel.send === "function") {
          const mention = roles.map((id) => `<@&${id}>`).join(" ") || "staff";
          await channel
            .send({
              content: `${mention} — staff assistance requested in this ticket.`,
              allowedMentions: { parse: [], repliedUser: false },
            })
            .catch(() => undefined);
        }
        break;
    }

    await this.repository.updateTicket(guild.id, ticket.id, patch);
    if (action.action === "CLOSE") {
      await this.finalizeClose(guild, ticket, actorId, action.reason ?? null, textChannel);
    }

    await this.audit({
      guildId: guild.id,
      actorId,
      actorType: "USER",
      action: `tickets.${action.action.toLowerCase()}`,
      targetType: "Ticket",
      targetId: ticket.id,
      after: {
        ...patch,
        ...(action.userId ? { userId: action.userId } : {}),
        ...(action.name ? { name: action.name } : {}),
      },
    });
    return (await this.repository.findTicketById(guild.id, ticket.id)) ?? ticket;
  }

  async rateTicket(guild: Guild, actorId: string, ticketId: string, input: unknown): Promise<void> {
    const rating = ticketRatingSchema.parse(input);
    const ticket = await this.repository.findTicketById(guild.id, ticketId);
    if (!ticket) throw new ApiActionError("NOT_FOUND", "That ticket no longer exists.", 404);
    const settings = await this.settings(guild.id);
    if (!settings.ratingEnabled) {
      throw new ApiActionError("FORBIDDEN", "Ratings are disabled on this server.", 403);
    }
    if (ticket.openerId !== actorId) {
      throw new ApiActionError("FORBIDDEN", "Only the ticket opener can rate this ticket.", 403);
    }
    await this.repository.updateTicket(guild.id, ticket.id, {
      rating: rating.rating,
      ratingComment: rating.comment ?? null,
    });
    await this.audit({
      guildId: guild.id,
      actorId,
      actorType: "USER",
      action: "tickets.rating",
      targetType: "Ticket",
      targetId: ticket.id,
      after: { rating: rating.rating, comment: rating.comment ?? null },
    });
  }

  async addBlacklist(guild: Guild, actorId: string, input: unknown): Promise<void> {
    const member = await fetchMember(guild, actorId);
    if (
      !member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
      !member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    ) {
      throw new ApiActionError("FORBIDDEN", "You need Manage Server or Manage Channels.", 403);
    }
    const parsed = ticketBlacklistSchema.parse(input);
    const target = await fetchMember(guild, parsed.userId);
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me) throw new ApiActionError("INTERNAL", "Bot member is unavailable.", 503);
    assertHierarchy({ guild, actor: member, target, me });
    const entry: TicketBlacklistEntry = {
      userId: parsed.userId,
      reason: parsed.reason,
      ...(parsed.expiresAt ? { expiresAt: parsed.expiresAt } : {}),
    };
    await this.repository.addBlacklist(guild.id, entry, actorId);
    this.invalidate(guild.id);
    await this.audit({
      guildId: guild.id,
      actorId,
      actorType: "USER",
      action: "tickets.blacklist.add",
      targetType: "User",
      targetId: parsed.userId,
      after: entry,
    });
  }

  async stats(guildId: string): Promise<TicketStats> {
    return this.repository.stats(guildId);
  }

  private async finalizeClose(
    guild: Guild,
    ticket: TicketRecord,
    actorId: string,
    reason: string | null,
    channel: GuildTextBasedChannel | null,
  ): Promise<void> {
    if (channel) {
      try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcript = buildTranscriptHtml(
          [...messages.values()].reverse().map((message) => ({
            authorTag: message.author.tag || message.author.username,
            content: message.content,
            createdAt: message.createdAt,
          })),
        );
        await this.repository.saveTranscript({
          guildId: guild.id,
          ticketId: ticket.id,
          ...transcript,
        });
        const settings = await this.settings(guild.id);
        if (settings.transcriptChannelId) {
          const target =
            guild.channels.cache.get(settings.transcriptChannelId) ??
            (await guild.channels.fetch(settings.transcriptChannelId).catch(() => null));
          if (
            target &&
            target.isTextBased() &&
            "send" in target &&
            typeof target.send === "function"
          ) {
            await target.send({
              embeds: [
                baseEmbed({
                  title: `Ticket #${ticket.number} transcript`,
                  description:
                    `${transcript.messageCount} message(s) closed by <@${actorId}>. ${reason ? truncate(reason, 200) : ""}`.trim(),
                }),
              ],
              files: [
                {
                  name: `ticket-${ticket.number}.html`,
                  attachment: Buffer.from(transcript.html, "utf8"),
                },
              ],
              allowedMentions: { parse: [], repliedUser: false },
            });
          }
        }
      } catch (error) {
        this.logger.warn(
          { err: serializeError(error), guildId: guild.id, ticketId: ticket.id },
          "ticket transcript failed; ticket still closed",
        );
      }
    }

    try {
      if (channel) await channel.delete(`Ticket closed by ${actorId}`);
      await this.repository.updateTicket(guild.id, ticket.id, { deletedAt: new Date() });
    } catch (error) {
      this.logger.warn(
        { err: serializeError(error), guildId: guild.id, ticketId: ticket.id },
        "ticket channel cleanup failed",
      );
    }
  }

  private async snapshot(guildId: string): Promise<TicketSnapshot> {
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > this.now()) return cached;
    const pending = this.inflight.get(guildId);
    if (pending) return pending;

    const load = (async (): Promise<TicketSnapshot> => {
      try {
        const [settings, categories, allCategories] = await Promise.all([
          this.repository.loadSettings(guildId),
          this.repository.loadCategories(guildId, false),
          this.repository.loadCategories(guildId, true),
        ]);
        const snapshot: TicketSnapshot = {
          settings: settings
            ? { ...settings, supportRoleIds: [...settings.supportRoleIds] }
            : { ...DEFAULT_TICKET_SETTINGS },
          categories,
          allCategories,
          panels: new Map(),
          expiresAt: this.now() + this.ttlMs,
        };
        this.store(guildId, snapshot);
        return snapshot;
      } catch (error) {
        this.logger.warn(
          { err: serializeError(error), guildId },
          "ticket config unavailable; using safe defaults",
        );
        const snapshot: TicketSnapshot = {
          settings: { ...DEFAULT_TICKET_SETTINGS },
          categories: [],
          allCategories: [],
          panels: new Map(),
          expiresAt: this.now() + this.failureTtlMs,
        };
        this.store(guildId, snapshot);
        return snapshot;
      }
    })().finally(() => this.inflight.delete(guildId));

    this.inflight.set(guildId, load);
    return load;
  }

  private store(guildId: string, snapshot: TicketSnapshot): void {
    this.cache.delete(guildId);
    this.cache.set(guildId, snapshot);
  }
}

export type { TicketPanelEmbed };
