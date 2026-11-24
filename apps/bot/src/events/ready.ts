import { ActivityType } from "discord.js";
import { deployCommands } from "../lib/deploy-commands";
import { serializeError } from "../lib/errors";
import { ensureGuildRow } from "../lib/guilds";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "ready",
  once: true,
  execute: async (client) => {
    const user = client.user;
    if (!user) {
      client.logger.error("ready fired without a client user");
      return;
    }

    client.logger.info(
      {
        user: user.tag,
        userId: user.id,
        guilds: client.guilds.cache.size,
        shard: client.shard?.ids ?? [0],
      },
      "gateway ready",
    );

    // Existing guilds (installed before this boot) still need their row.
    for (const guild of client.guilds.cache.values()) {
      await ensureGuildRow(guild, client.logger);
    }

    try {
      user.setPresence({
        status: client.env.BOT_STATUS,
        activities: [{ name: client.env.BOT_ACTIVITY, type: ActivityType.Watching }],
      });
    } catch (error) {
      client.logger.warn({ err: serializeError(error) }, "failed to set presence");
    }

    // Development convenience: instant command registration in DEV_GUILD_ID.
    if (client.env.DEV_GUILD_ID && client.env.NODE_ENV !== "production") {
      try {
        await deployCommands({
          token: client.env.DISCORD_TOKEN,
          applicationId: client.application?.id ?? client.env.DISCORD_CLIENT_ID,
          guildId: client.env.DEV_GUILD_ID,
          commands: client.commands.values(),
          logger: client.logger,
        });
      } catch (error) {
        client.logger.error({ err: serializeError(error) }, "development command sync failed");
      }
    }
  },
});
