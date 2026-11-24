export type ChannelTypeName =
  "text" | "voice" | "category" | "announcement" | "stage" | "forum" | "thread" | "other";

export interface ChannelDTO {
  id: string;
  name: string;
  type: ChannelTypeName;
  parentId: string | null;
  position: number;
  nsfw: boolean;
  topic: string | null;
}

export interface RoleDTO {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  mentionable: boolean;
  /** Serialized bigint permission bitfield (decimal string). */
  permissions: string;
}

export interface MemberDTO {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bot: boolean;
  joinedAt: string;
  createdAt: string;
  roleIds: string[];
  highestRoleId: string | null;
}

export interface EmojiDTO {
  id: string;
  name: string;
  animated: boolean;
  url: string;
}

export interface GuildSummaryDTO {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  memberCount: number;
}

export interface GuildLiveStatsDTO {
  guildId: string;
  memberCount: number;
  onlineCount: number;
  boostCount: number;
  channelCount: number;
  roleCount: number;
  openTickets: number;
  modActions7d: number;
  pingMs: number;
  uptimeSeconds: number;
  capturedAt: string;
}

export interface MetaDTO {
  version: string;
  apiVersion: string;
  shards: number;
  pingMs: number;
  uptimeSeconds: number;
  guildCount: number;
  userCount: number;
  queueDepth: number;
  startedAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface BotHealthDTO {
  ok: boolean;
  database: boolean;
  gateway: boolean;
  version: string;
}
