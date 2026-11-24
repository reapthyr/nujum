import { getPrisma } from "@nujum/shared/prisma";
import type {
  JtcPresetInput,
  JtcPresetRecord,
  JtcRepository,
  JtcRoomRecord,
  JtcRoomUpdate,
  JtcSettings,
} from "./types";

function toSettings(row: {
  enabled: boolean;
  generatorChannelId: string | null;
  categoryId: string | null;
  nameTemplate: string;
  defaultLimit: number;
  defaultBitrate: number;
  defaultRegion: string | null;
  panelChannelId: string | null;
  interfaceChannelId: string | null;
  trustedRoleIds: string[];
}): JtcSettings {
  return {
    enabled: row.enabled,
    generatorChannelId: row.generatorChannelId,
    categoryId: row.categoryId,
    nameTemplate: row.nameTemplate,
    defaultLimit: row.defaultLimit,
    defaultBitrate: row.defaultBitrate,
    defaultRegion: row.defaultRegion,
    panelChannelId: row.panelChannelId,
    interfaceChannelId: row.interfaceChannelId,
    trustedRoleIds: [...row.trustedRoleIds],
  };
}

function toRoom(row: {
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
}): JtcRoomRecord {
  return { ...row };
}

function toPreset(row: {
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
}): JtcPresetRecord {
  return { ...row };
}

/** Prisma-backed JTC configuration, room and preset repository. */
export class PrismaJtcRepository implements JtcRepository {
  async loadSettings(guildId: string): Promise<JtcSettings | null> {
    const row = await getPrisma().jtcConfig.findUnique({ where: { guildId } });
    return row ? toSettings(row) : null;
  }

  async loadRoomByChannel(guildId: string, channelId: string): Promise<JtcRoomRecord | null> {
    const row = await getPrisma().jtcRoom.findFirst({ where: { guildId, channelId } });
    return row ? toRoom(row) : null;
  }

  async loadRoomByOwner(guildId: string, ownerId: string): Promise<JtcRoomRecord | null> {
    const row = await getPrisma().jtcRoom.findFirst({
      where: { guildId, ownerId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return row ? toRoom(row) : null;
  }

  async createRoom(data: {
    guildId: string;
    channelId: string;
    ownerId: string;
    locked: boolean;
    hidden: boolean;
    userLimit: number;
    bitrate: number;
    region: string | null;
  }): Promise<JtcRoomRecord> {
    return toRoom(await getPrisma().jtcRoom.create({ data }));
  }

  async updateRoom(guildId: string, roomId: string, patch: JtcRoomUpdate): Promise<void> {
    await getPrisma().jtcRoom.updateMany({ where: { guildId, id: roomId }, data: patch });
  }

  async markRoomDeleted(guildId: string, channelId: string): Promise<void> {
    await getPrisma().jtcRoom.updateMany({
      where: { guildId, channelId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async loadPresets(guildId: string, userId: string): Promise<JtcPresetRecord[]> {
    const rows = await getPrisma().jtcPreset.findMany({
      where: { guildId, userId },
      orderBy: { name: "asc" },
    });
    return rows.map(toPreset);
  }

  async savePreset(
    guildId: string,
    userId: string,
    input: JtcPresetInput,
  ): Promise<JtcPresetRecord> {
    return getPrisma().$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.jtcPreset.updateMany({
          where: { guildId, userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return toPreset(
        await tx.jtcPreset.upsert({
          where: { guildId_userId_name: { guildId, userId, name: input.name } },
          create: { guildId, userId, ...input },
          update: input,
        }),
      );
    });
  }

  async deletePreset(guildId: string, userId: string, name: string): Promise<void> {
    await getPrisma().jtcPreset.deleteMany({ where: { guildId, userId, name } });
  }
}
