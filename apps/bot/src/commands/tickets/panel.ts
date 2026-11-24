import { ChannelType, MessageFlags, SlashCommandBuilder, type GuildBasedChannel } from "discord.js";
import { PANEL_TYPES, zEnum } from "@nujum/shared";
import { baseEmbed, truncate } from "../../lib/embeds";
import { serializeError, toUserMessage } from "../../lib/errors";
import type { TicketPanelEmbed } from "../../tickets/types";
import type { TicketSendChannel } from "../../tickets/service";
import { parseTicketPanelInput } from "../../tickets/validation";
import { defineCommand, withScope } from "../types";

function sendChannel(channel: unknown): TicketSendChannel | undefined {
  if (!channel || typeof channel !== "object") return undefined;
  const candidate = channel as GuildBasedChannel & {
    send?: TicketSendChannel["send"];
    permissionsFor?: TicketSendChannel["permissionsFor"];
  };
  if (
    !candidate.isTextBased() ||
    typeof candidate.send !== "function" ||
    typeof candidate.permissionsFor !== "function"
  ) {
    return undefined;
  }
  return candidate;
}

export const command = defineCommand({
  name: "panel",
  data: withScope(
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Publish or refresh a ticket panel.")
      .addSubcommand((sub) =>
        sub
          .setName("publish")
          .setDescription("Post the stored panel, or save and post a new one.")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Target channel (defaults to the configured panel channel)")
              .addChannelTypes(ChannelType.GuildText),
          )
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("Component style when saving a new panel")
              .addChoices(...PANEL_TYPES.map((value) => ({ name: value.toLowerCase(), value }))),
          )
          .addStringOption((option) =>
            option.setName("title").setDescription("Embed title").setMaxLength(256),
          )
          .addStringOption((option) =>
            option.setName("description").setDescription("Embed description").setMaxLength(4096),
          )
          .addStringOption((option) =>
            option
              .setName("categories")
              .setDescription("Comma-separated category ids when saving a new panel")
              .setMaxLength(500),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("preview")
          .setDescription("Preview the panel in the current channel without saving it.")
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("Component style")
              .addChoices(...PANEL_TYPES.map((value) => ({ name: value.toLowerCase(), value }))),
          )
          .addStringOption((option) =>
            option.setName("title").setDescription("Embed title").setMaxLength(256),
          )
          .addStringOption((option) =>
            option.setName("description").setDescription("Embed description").setMaxLength(4096),
          )
          .addStringOption((option) =>
            option
              .setName("categories")
              .setDescription("Comma-separated category ids")
              .setMaxLength(500),
          ),
      ),
    "guild",
  ),
  async execute({ interaction, client, logger }) {
    const guild = interaction.guild;
    if (!guild) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const subcommand = interaction.options.getSubcommand();
      const preview = subcommand === "preview";
      const channelOption = preview ? null : interaction.options.getChannel("channel");
      const channelId = channelOption?.id ?? null;
      const typeOption = interaction.options.getString("type");
      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const categoryOption = interaction.options.getString("categories");
      const supplied = Boolean(typeOption || title || description || categoryOption || channelId);

      let panelId: string | undefined;
      let previewPanel:
        | { type: "BUTTONS" | "DROPDOWN"; embed: TicketPanelEmbed; categoryIds: readonly string[] }
        | undefined;
      if (supplied) {
        const available = await client.tickets.categories(guild.id, true);
        const categoryIds = categoryOption
          ? categoryOption
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          : available.map((category) => category.id);
        if (categoryIds.some((id) => !available.some((category) => category.id === id))) {
          throw new Error("Every category id must belong to this server.");
        }
        const input = parseTicketPanelInput({
          channelId: channelId ?? interaction.channelId,
          type: zEnum(PANEL_TYPES).parse(typeOption ?? "BUTTONS"),
          embed: {
            title: title ?? "Support tickets",
            description: description ?? "Choose a category below and we will be with you shortly.",
          },
          categoryIds,
        });
        if (preview) {
          // Preview uses the same validation, but must not write a panel row.
          previewPanel = {
            type: input.type,
            embed: input.embed,
            categoryIds: input.categoryIds,
          };
        } else {
          const panel = await client.tickets.savePanel(
            guild.id,
            { ...input, categoryIds: input.categoryIds },
            interaction.user.id,
          );
          panelId = panel.id;
        }
      }

      const result = await client.tickets.publish(
        guild.id,
        { channelId, preview },
        interaction.user.id,
        {
          guild,
          ...(panelId ? { panelId } : {}),
          ...(preview ? { previewChannel: sendChannel(interaction.channel) } : {}),
          ...(previewPanel ? { previewPanel } : {}),
        },
      );
      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: preview ? "Panel preview posted" : "Ticket panel published",
            description: truncate(`Message: ${result.messageId ?? "unknown"}`, 200),
          }),
        ],
      });
    } catch (error) {
      logger.error({ err: serializeError(error), guildId: guild.id }, "/panel failed");
      await interaction
        .editReply({ content: truncate(toUserMessage(error), 300), embeds: [] })
        .catch(() => undefined);
    }
  },
});
