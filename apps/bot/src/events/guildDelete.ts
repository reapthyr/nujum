import { markGuildLeft } from "../lib/guilds";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "guildDelete",
  execute: async (client, guild) => {
    await markGuildLeft(guild.id, client.logger);
    client.logger.info(
      {
        guildId: guild.id,
        name: guild.name ?? "(unavailable)",
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      },
      "left guild",
    );
  },
});
