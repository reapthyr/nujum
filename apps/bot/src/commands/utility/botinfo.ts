import { SlashCommandBuilder, version as discordVersion } from "discord.js";
import { BRAND } from "@nujum/shared";
import { BOT_VERSION } from "../../config/constants";
import { baseEmbed } from "../../lib/embeds";
import { defineCommand, withScope } from "../types";

export const command = defineCommand({
  name: "botinfo",
  data: withScope(
    new SlashCommandBuilder()
      .setName("botinfo")
      .setDescription("Show bot version, uptime and shard information."),
    "both",
  ),
  async execute({ interaction, client, requestId }) {
    await interaction.deferReply();

    const memberCount = client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
    const heapMiB = process.memoryUsage().heapUsed / 1024 / 1024;
    const shardCount = client.shard?.count ?? client.options.shardCount ?? 1;
    const shardId = client.shard?.ids.join(", ") ?? "0";

    const embed = baseEmbed({
      title: `About ${BRAND.name}`,
      description: BRAND.description,
    }).addFields(
      { name: "Servers", value: client.guilds.cache.size.toLocaleString("en-US"), inline: true },
      { name: "Members", value: memberCount.toLocaleString("en-US"), inline: true },
      { name: "Shards", value: `${shardId} / ${shardCount}`, inline: true },
      { name: "Gateway", value: `${Math.max(0, Math.round(client.ws.ping))}ms`, inline: true },
      { name: "Uptime", value: `<t:${Math.floor(client.startedAt / 1000)}:R>`, inline: true },
      { name: "Memory", value: `${heapMiB.toFixed(1)} MiB`, inline: true },
      {
        name: "Versions",
        value: `Bot \`${BOT_VERSION}\` • Node \`${process.version}\` • discord.js \`${discordVersion}\``,
        inline: false,
      },
      { name: "Reference", value: `\`${requestId}\``, inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
});
