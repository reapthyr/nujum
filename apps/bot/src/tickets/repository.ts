import { type Prisma, getPrisma } from "@nujum/shared/prisma";
import type {
  TicketBlacklistEntry,
  TicketCategoryRecord,
  TicketCreateData,
  TicketPanelEmbed,
  TicketPanelRecord,
  TicketRecord,
  TicketRepository,
  TicketSettings,
  TicketStats,
  TicketTranscriptData,
  TicketUpdate,
} from "./types";

function toSettings(row: {
  enabled: boolean;
  panelChannelId: string | null;
  transcriptChannelId: string | null;
  logChannelId: string | null;
  supportRoleIds: string[];
  maxOpenPerUser: number;
  inactivityHours: number;
  warnBeforeHours: number;
  namingFormat: string;
  ratingEnabled: boolean;
}): TicketSettings {
  return {
    enabled: row.enabled,
    panelChannelId: row.panelChannelId,
    transcriptChannelId: row.transcriptChannelId,
    logChannelId: row.logChannelId,
    supportRoleIds: [...row.supportRoleIds],
    maxOpenPerUser: row.maxOpenPerUser,
    inactivityHours: row.inactivityHours,
    warnBeforeHours: row.warnBeforeHours,
    namingFormat: row.namingFormat,
    ratingEnabled: row.ratingEnabled,
  };
}

function toCategory(row: {
  id: string;
  guildId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  discordCategoryId: string | null;
  supportRoleIds: string[];
  formFields: Prisma.JsonValue;
  position: number;
  enabled: boolean;
}): TicketCategoryRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    discordCategoryId: row.discordCategoryId,
    supportRoleIds: [...row.supportRoleIds],
    formFields: Array.isArray(row.formFields) ? row.formFields : [],
    position: row.position,
    enabled: row.enabled,
  };
}

function toPanel(row: {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  type: TicketPanelRecord["type"];
  embed: Prisma.JsonValue;
  categoryIds: string[];
  published: boolean;
}): TicketPanelRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    messageId: row.messageId,
    type: row.type,
    embed: row.embed,
    categoryIds: [...row.categoryIds],
    published: row.published,
  };
}

function toTicket(row: {
  id: string;
  guildId: string;
  number: number;
  channelId: string;
  categoryId: string | null;
  openerId: string;
  status: TicketRecord["status"];
  priority: TicketRecord["priority"];
  claimedBy: string | null;
  rating: number | null;
  ratingComment: string | null;
  closedAt: Date | null;
}): TicketRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    number: row.number,
    channelId: row.channelId,
    categoryId: row.categoryId,
    openerId: row.openerId,
    status: row.status,
    priority: row.priority,
    claimedBy: row.claimedBy,
    rating: row.rating,
    ratingComment: row.ratingComment,
    closedAt: row.closedAt,
  };
}

/** Prisma-backed ticket repository used by the production bot. */
export class PrismaTicketRepository implements TicketRepository {
  async loadSettings(guildId: string): Promise<TicketSettings | null> {
    const row = await getPrisma().ticketConfig.findUnique({ where: { guildId } });
    return row ? toSettings(row) : null;
  }

  async loadCategories(guildId: string, includeDisabled: boolean): Promise<TicketCategoryRecord[]> {
    const rows = await getPrisma().ticketCategory.findMany({
      where: { guildId, ...(includeDisabled ? {} : { enabled: true }) },
      orderBy: { position: "asc" },
    });
    return rows.map(toCategory);
  }

  async loadPanel(guildId: string, panelId?: string): Promise<TicketPanelRecord | null> {
    const row = await getPrisma().ticketPanel.findFirst({
      where: { guildId, ...(panelId ? { id: panelId } : {}) },
      orderBy: { updatedAt: "desc" },
    });
    return row ? toPanel(row) : null;
  }

  async upsertPanel(
    guildId: string,
    input: {
      channelId: string;
      type: TicketPanelRecord["type"];
      embed: TicketPanelEmbed;
      categoryIds: readonly string[];
    },
    actorId: string,
  ): Promise<TicketPanelRecord> {
    const row = await getPrisma().ticketPanel.create({
      data: {
        guildId,
        channelId: input.channelId,
        type: input.type,
        embed: input.embed,
        categoryIds: [...input.categoryIds],
        updatedBy: actorId,
      },
    });
    return toPanel(row);
  }

  async markPanelPublished(panelId: string, messageId: string): Promise<void> {
    await getPrisma().ticketPanel.update({
      where: { id: panelId },
      data: { messageId, published: true },
    });
  }

  async countOpenByUser(guildId: string, openerId: string): Promise<number> {
    return getPrisma().ticket.count({
      where: { guildId, openerId, status: { in: ["OPEN", "CLAIMED"] } },
    });
  }

  async isBlacklisted(guildId: string, userId: string, now: Date): Promise<boolean> {
    const row = await getPrisma().ticketBlacklist.findFirst({
      where: {
        guildId,
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    return row !== null;
  }

  async addBlacklist(guildId: string, entry: TicketBlacklistEntry, actorId: string): Promise<void> {
    await getPrisma().ticketBlacklist.upsert({
      where: { guildId_userId: { guildId, userId: entry.userId } },
      create: {
        guildId,
        userId: entry.userId,
        reason: entry.reason,
        createdBy: actorId,
        expiresAt: entry.expiresAt ?? null,
      },
      update: {
        reason: entry.reason,
        createdBy: actorId,
        expiresAt: entry.expiresAt ?? null,
      },
    });
  }

  /** Atomic per-guild counter; concurrent ticket starts cannot collide. */
  async nextTicketNumber(guildId: string): Promise<number> {
    return getPrisma().$transaction(async (tx) => {
      const updated = await tx.guild.update({
        where: { id: guildId },
        data: { ticketCounter: { increment: 1 } },
        select: { ticketCounter: true },
      });
      return updated.ticketCounter;
    });
  }

  async createTicket(data: TicketCreateData): Promise<TicketRecord> {
    const row = await getPrisma().ticket.create({
      data: {
        guildId: data.guildId,
        number: data.number,
        channelId: data.channelId,
        categoryId: data.categoryId,
        openerId: data.openerId,
        participants: {
          create: { userId: data.openerId, addedBy: data.openerId },
        },
      },
    });
    return toTicket(row);
  }

  async addParticipant(ticketId: string, userId: string, addedBy: string): Promise<void> {
    await getPrisma().ticketParticipant.upsert({
      where: { ticketId_userId: { ticketId, userId } },
      create: { ticketId, userId, addedBy },
      update: {},
    });
  }

  async removeParticipant(ticketId: string, userId: string): Promise<void> {
    await getPrisma().ticketParticipant.deleteMany({ where: { ticketId, userId } });
  }

  async hasParticipant(ticketId: string, userId: string): Promise<boolean> {
    const row = await getPrisma().ticketParticipant.findUnique({
      where: { ticketId_userId: { ticketId, userId } },
      select: { id: true },
    });
    return row !== null;
  }

  async findTicket(guildId: string, channelId: string): Promise<TicketRecord | null> {
    const row = await getPrisma().ticket.findFirst({ where: { guildId, channelId } });
    return row ? toTicket(row) : null;
  }

  async findTicketById(guildId: string, ticketId: string): Promise<TicketRecord | null> {
    const row = await getPrisma().ticket.findFirst({ where: { guildId, id: ticketId } });
    return row ? toTicket(row) : null;
  }

  async updateTicket(guildId: string, ticketId: string, patch: TicketUpdate): Promise<void> {
    await getPrisma().ticket.updateMany({ where: { guildId, id: ticketId }, data: patch });
  }

  async addNote(ticketId: string, authorId: string, content: string): Promise<void> {
    await getPrisma().ticketNote.create({ data: { ticketId, authorId, content } });
  }

  async saveTranscript(data: TicketTranscriptData): Promise<void> {
    await getPrisma().ticketTranscript.upsert({
      where: { ticketId: data.ticketId },
      create: {
        ticketId: data.ticketId,
        guildId: data.guildId,
        html: data.html,
        messageCount: data.messageCount,
        sizeBytes: data.sizeBytes,
      },
      update: {
        html: data.html,
        messageCount: data.messageCount,
        sizeBytes: data.sizeBytes,
      },
    });
  }

  async stats(guildId: string): Promise<TicketStats> {
    const prisma = getPrisma();
    const [open, claimed, closed] = await Promise.all([
      prisma.ticket.count({ where: { guildId, status: "OPEN" } }),
      prisma.ticket.count({ where: { guildId, status: "CLAIMED" } }),
      prisma.ticket.count({ where: { guildId, status: "CLOSED" } }),
    ]);
    return { open, claimed, closed };
  }
}
