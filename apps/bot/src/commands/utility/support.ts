import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import { BRAND } from "@nujum/shared";
import { baseEmbed } from "../../lib/embeds";
import { defineCommand, withScope } from "../types";

export const command = defineCommand({
  name: "support",
  data: withScope(
    new SlashCommandBuilder().setName("support").setDescription("Get the support server link."),
    "both",
  ),
  async execute({ interaction, client }) {
    const embed = baseEmbed({
      title: `${BRAND.name} support`,
      description: `Need help, found a bug, or want release notes? Join the support server.\n\n**Status:** [status page](${BRAND.docs})`,
    });

    const support = new ButtonBuilder()
      .setLabel("Support server")
      .setStyle(ButtonStyle.Link)
      .setURL(client.env.SUPPORT_SERVER_URL);
    const dashboard = new ButtonBuilder()
      .setLabel("Dashboard")
      .setStyle(ButtonStyle.Link)
      .setURL(BRAND.website);

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(support, dashboard)],
    });
  },
});
