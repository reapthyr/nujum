import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from "discord.js";
import { BRAND, COMMAND_CATEGORIES, type CommandCategory } from "@nujum/shared";
import type { NujumClient } from "../../client/NujumClient";
import { buildCustomId } from "../components";
import { baseEmbed, truncate } from "../embeds";

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  moderation: "Moderation",
  tickets: "Tickets",
  utility: "Utility",
  configuration: "Configuration",
  leveling: "Leveling",
  community: "Community",
};

export interface HelpView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

/** Shared by /help and the refresh button so both render identical content. */
export function buildHelpView(
  client: NujumClient,
  owner: { userId: string; guildId: string | null },
): HelpView {
  const commands = [...client.commands.values()].sort((left, right) =>
    left.definition.name.localeCompare(right.definition.name),
  );

  const embed = baseEmbed({
    title: `${BRAND.name} — ${commands.length} commands available`,
    description: `${BRAND.tagline}\nEvery module is configured from the web dashboard.`,
  });

  for (const category of COMMAND_CATEGORIES) {
    const inCategory = commands.filter((command) => command.definition.category === category);
    if (inCategory.length === 0) continue;
    const value = truncate(
      inCategory
        .map((command) => `**/${command.definition.name}** — ${command.definition.description}`)
        .join("\n"),
      1024,
    );
    embed.addFields({ name: CATEGORY_LABELS[category], value, inline: false });
  }

  embed.addFields({
    name: "Links",
    value: `[Dashboard](${BRAND.website}) • [Documentation](${BRAND.docs}) • [Support](${BRAND.supportServer})`,
    inline: false,
  });

  const refresh = new ButtonBuilder()
    .setCustomId(
      buildCustomId({
        module: "help",
        action: "refresh",
        guildId: owner.guildId,
        userId: owner.userId,
      }),
    )
    .setLabel("Refresh")
    .setEmoji("🔄")
    .setStyle(ButtonStyle.Secondary);

  const dashboard = new ButtonBuilder()
    .setLabel("Dashboard")
    .setStyle(ButtonStyle.Link)
    .setURL(BRAND.website);

  const support = new ButtonBuilder()
    .setLabel("Support server")
    .setStyle(ButtonStyle.Link)
    .setURL(client.env.SUPPORT_SERVER_URL);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(refresh, dashboard, support)],
  };
}
