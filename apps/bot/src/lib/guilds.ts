import { getPrisma } from "@nujum/shared/prisma";
import type { Guild } from "discord.js";
import { serializeError } from "./errors";
import type { BotLogger } from "./logger";

/**
 * Keeps the `Guild` row in sync with the gateway. Security tables reference it,
 * so it must exist before the first threat or config write.
 */
export async function ensureGuildRow(guild: Guild, logger: BotLogger): Promise<void> {
  try {
    await getPrisma().guild.upsert({
      where: { id: guild.id },
      create: {
        id: guild.id,
        name: guild.name,
        ownerId: guild.ownerId,
        iconHash: guild.icon,
      },
      update: {
        name: guild.name,
        ownerId: guild.ownerId,
        iconHash: guild.icon,
        leftAt: null,
      },
    });
  } catch (error) {
    logger.error({ err: serializeError(error), guildId: guild.id }, "failed to sync guild row");
  }
}

export async function markGuildLeft(guildId: string, logger: BotLogger): Promise<void> {
  try {
    await getPrisma().guild.updateMany({
      where: { id: guildId },
      data: { leftAt: new Date() },
    });
  } catch (error) {
    logger.error({ err: serializeError(error), guildId }, "failed to mark guild as left");
  }
}
