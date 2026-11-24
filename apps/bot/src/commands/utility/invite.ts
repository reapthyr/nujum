import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import { BRAND, COMMANDS, type DiscordPermission } from "@nujum/shared";
import { baseEmbed } from "../../lib/embeds";
import { permissionBits } from "../../lib/permissions";
import { defineCommand, withScope } from "../types";

/** Union of every bot permission required by a registered command, never Administrator. */
export function requiredInvitePermissions(): bigint {
  const required = new Set<DiscordPermission>();
  for (const command of COMMANDS) {
    for (const permission of command.botPermissions) {
      if (permission !== "Administrator") required.add(permission);
    }
  }
  return permissionBits([...required]);
}

export function buildInviteUrl(applicationId: string, override?: string): string {
  const permissions = override ?? requiredInvitePermissions().toString();
  const params = new URLSearchParams({
    client_id: applicationId,
    permissions,
    scope: "bot applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export const command = defineCommand({
  name: "invite",
  data: withScope(
    new SlashCommandBuilder().setName("invite").setDescription("Get the bot invite link."),
    "both",
  ),
  async execute({ interaction, client }) {
    const applicationId = client.application?.id ?? client.env.DISCORD_CLIENT_ID;
    const inviteUrl = buildInviteUrl(applicationId, process.env.INVITE_PERMISSIONS);

    const embed = baseEmbed({
      title: `Invite ${BRAND.name}`,
      description: `Add ${BRAND.name} to your server. It requests only the permissions its commands need — never Administrator.`,
    }).addFields({
      name: "What you get",
      value:
        "Moderation, tickets, join-to-create, security, logging and community modules, all managed from the dashboard.",
    });

    const add = new ButtonBuilder()
      .setLabel("Add to server")
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl);
    const dashboard = new ButtonBuilder()
      .setLabel("Dashboard")
      .setStyle(ButtonStyle.Link)
      .setURL(BRAND.website);

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(add, dashboard)],
    });
  },
});
