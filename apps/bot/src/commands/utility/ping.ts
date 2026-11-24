import { SlashCommandBuilder } from "discord.js";
import { baseEmbed } from "../../lib/embeds";
import { defineCommand, withScope } from "../types";

export const command = defineCommand({
  name: "ping",
  data: withScope(
    new SlashCommandBuilder().setName("ping").setDescription("Show gateway and API latency."),
    "both",
  ),
  async execute({ interaction, client, definition }) {
    const startedAt = Date.now();
    await interaction.deferReply();
    const roundTripMs = Date.now() - startedAt;
    const gatewayMs = Math.max(0, Math.round(client.ws.ping));

    const embed = baseEmbed({
      title: "🏓 Pong",
      description: [
        `**Gateway:** ${gatewayMs}ms`,
        `**Round trip:** ${roundTripMs}ms`,
        `**Uptime:** <t:${Math.floor(client.startedAt / 1000)}:R>`,
      ].join("\n"),
    }).setFooter({
      text: `Cooldown: ${(definition.cooldownMs / 1000).toFixed(0)}s • ${client.env.BOT_ACTIVITY}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
});
