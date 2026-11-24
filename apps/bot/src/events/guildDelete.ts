import { defineEvent } from "./types";

export const event = defineEvent({
  name: "guildDelete",
  execute: (client, guild) => {
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
