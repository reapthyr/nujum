import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildHelpView } from "../../lib/views/help";
import { defineCommand, withScope } from "../types";

export const command = defineCommand({
  name: "help",
  data: withScope(
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Browse commands or get details for one command."),
    "both",
  ),
  async execute({ interaction, client }) {
    const view = buildHelpView(client, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    await interaction.reply({
      embeds: view.embeds,
      components: view.components,
      flags: MessageFlags.Ephemeral,
    });
  },
});
