import { JTC_DEFAULTS } from "@nujum/shared";

/** Runtime shape of `JtcConfig`; disabled until explicitly opted in. */
export interface JtcSettings {
  enabled: boolean;
  generatorChannelId: string | null;
  categoryId: string | null;
  nameTemplate: string;
  defaultLimit: number;
  defaultBitrate: number;
  defaultRegion: string | null;
  panelChannelId: string | null;
  interfaceChannelId: string | null;
  trustedRoleIds: readonly string[];
}

export const DEFAULT_JTC_SETTINGS: Readonly<JtcSettings> = Object.freeze({
  enabled: false,
  generatorChannelId: null,
  categoryId: null,
  nameTemplate: JTC_DEFAULTS.nameTemplate,
  defaultLimit: JTC_DEFAULTS.defaultLimit,
  defaultBitrate: JTC_DEFAULTS.defaultBitrate,
  defaultRegion: JTC_DEFAULTS.defaultRegion,
  panelChannelId: null,
  interfaceChannelId: null,
  trustedRoleIds: [],
});

export interface JtcRoomRecord {
  id: string;
  guildId: string;
  channelId: string;
  ownerId: string;
  locked: boolean;
  hidden: boolean;
  userLimit: number;
  bitrate: number;
  region: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface JtcPresetRecord {
  id: string;
  guildId: string;
  userId: string;
  name: string;
  locked: boolean;
  hidden: boolean;
  userLimit: number;
  bitrate: number;
  region: string | null;
  isDefault: boolean;
}

export interface JtcRoomUpdate {
  ownerId?: string;
  locked?: boolean;
  hidden?: boolean;
  userLimit?: number;
  bitrate?: number;
  region?: string | null;
  deletedAt?: Date | null;
}

export interface JtcPresetInput {
  name: string;
  locked: boolean;
  hidden: boolean;
  userLimit: number;
  bitrate: number;
  region: string | null;
  isDefault: boolean;
}

export interface JtcRepository {
  loadSettings(guildId: string): Promise<JtcSettings | null>;
  loadRoomByChannel(guildId: string, channelId: string): Promise<JtcRoomRecord | null>;
  loadRoomByOwner(guildId: string, ownerId: string): Promise<JtcRoomRecord | null>;
  createRoom(data: {
    guildId: string;
    channelId: string;
    ownerId: string;
    locked: boolean;
    hidden: boolean;
    userLimit: number;
    bitrate: number;
    region: string | null;
  }): Promise<JtcRoomRecord>;
  updateRoom(guildId: string, roomId: string, patch: JtcRoomUpdate): Promise<void>;
  markRoomDeleted(guildId: string, channelId: string): Promise<void>;
  loadPresets(guildId: string, userId: string): Promise<JtcPresetRecord[]>;
  savePreset(guildId: string, userId: string, input: JtcPresetInput): Promise<JtcPresetRecord>;
  deletePreset(guildId: string, userId: string, name: string): Promise<void>;
}
