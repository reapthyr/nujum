import {
  TICKET_DEFAULTS,
  type PanelType,
  type TicketPriority,
  type TicketStatus,
} from "@nujum/shared";
import type { z } from "zod";
import type { embedSchema } from "@nujum/shared";

export type TicketPanelEmbed = z.infer<typeof embedSchema>;

/** Runtime shape of `TicketConfig`; structural so services can be tested without Prisma. */
export interface TicketSettings {
  enabled: boolean;
  panelChannelId: string | null;
  transcriptChannelId: string | null;
  logChannelId: string | null;
  supportRoleIds: readonly string[];
  maxOpenPerUser: number;
  inactivityHours: number;
  warnBeforeHours: number;
  namingFormat: string;
  ratingEnabled: boolean;
}

/**
 * Safe fallback: modules stay disabled until a dashboard row opts in, while
 * all numeric/format values come from the shared defaults.
 */
export const DEFAULT_TICKET_SETTINGS: Readonly<TicketSettings> = Object.freeze({
  enabled: false,
  panelChannelId: null,
  transcriptChannelId: null,
  logChannelId: null,
  supportRoleIds: [],
  maxOpenPerUser: TICKET_DEFAULTS.maxOpenPerUser,
  inactivityHours: TICKET_DEFAULTS.inactivityHours,
  warnBeforeHours: TICKET_DEFAULTS.warnBeforeHours,
  namingFormat: TICKET_DEFAULTS.namingFormat,
  ratingEnabled: true,
});

export interface TicketCategoryRecord {
  id: string;
  guildId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  discordCategoryId: string | null;
  supportRoleIds: readonly string[];
  formFields: readonly unknown[];
  position: number;
  enabled: boolean;
}

export interface TicketPanelRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  type: PanelType;
  embed: unknown;
  categoryIds: readonly string[];
  published: boolean;
}

export interface TicketRecord {
  id: string;
  guildId: string;
  number: number;
  channelId: string;
  categoryId: string | null;
  openerId: string;
  status: TicketStatus;
  priority: TicketPriority;
  claimedBy: string | null;
  rating: number | null;
  ratingComment: string | null;
  closedAt: Date | null;
}

export interface TicketStats {
  open: number;
  claimed: number;
  closed: number;
}

export interface TicketCreateData {
  guildId: string;
  number: number;
  channelId: string;
  categoryId: string | null;
  openerId: string;
}

export interface TicketUpdate {
  status?: TicketStatus;
  priority?: TicketPriority;
  claimedBy?: string | null;
  closedBy?: string | null;
  closeReason?: string | null;
  rating?: number;
  ratingComment?: string | null;
  closedAt?: Date | null;
  deletedAt?: Date | null;
  lastActivityAt?: Date;
}

export interface TicketTranscriptData {
  guildId: string;
  ticketId: string;
  html: string;
  messageCount: number;
  sizeBytes: number;
}

export interface TicketBlacklistEntry {
  userId: string;
  reason: string;
  expiresAt?: Date;
}

export interface TicketRepository {
  loadSettings(guildId: string): Promise<TicketSettings | null>;
  loadCategories(guildId: string, includeDisabled: boolean): Promise<TicketCategoryRecord[]>;
  loadPanel(guildId: string, panelId?: string): Promise<TicketPanelRecord | null>;
  upsertPanel(
    guildId: string,
    input: {
      channelId: string;
      type: PanelType;
      embed: TicketPanelEmbed;
      categoryIds: readonly string[];
    },
    actorId: string,
  ): Promise<TicketPanelRecord>;
  markPanelPublished(panelId: string, messageId: string): Promise<void>;
  countOpenByUser(guildId: string, openerId: string): Promise<number>;
  isBlacklisted(guildId: string, userId: string, now: Date): Promise<boolean>;
  addBlacklist(guildId: string, entry: TicketBlacklistEntry, actorId: string): Promise<void>;
  nextTicketNumber(guildId: string): Promise<number>;
  createTicket(data: TicketCreateData): Promise<TicketRecord>;
  addParticipant(ticketId: string, userId: string, addedBy: string): Promise<void>;
  removeParticipant(ticketId: string, userId: string): Promise<void>;
  hasParticipant(ticketId: string, userId: string): Promise<boolean>;
  findTicket(guildId: string, channelId: string): Promise<TicketRecord | null>;
  findTicketById(guildId: string, ticketId: string): Promise<TicketRecord | null>;
  updateTicket(guildId: string, ticketId: string, patch: TicketUpdate): Promise<void>;
  addNote(ticketId: string, authorId: string, content: string): Promise<void>;
  saveTranscript(data: TicketTranscriptData): Promise<void>;
  stats(guildId: string): Promise<TicketStats>;
}
