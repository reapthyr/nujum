import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { embedSchema, TICKET_DEFAULTS } from "@nujum/shared";
import { buildCustomId } from "../lib/components";
import { baseEmbed } from "../lib/embeds";
import type { TicketCategoryRecord, TicketPanelEmbed, TicketPanelRecord } from "./types";

export const TICKET_BUTTONS_PER_ROW = 5;

export interface TicketPanelView {
  embeds: EmbedBuilder[];
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
}

function safeLabel(value: string, max: number): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function panelEmbed(raw: unknown): EmbedBuilder {
  const parsed = embedSchema.safeParse(raw);
  const data: TicketPanelEmbed | undefined = parsed.success ? parsed.data : undefined;
  const embed = baseEmbed({
    title: data?.title ?? "Support tickets",
    description: data?.description ?? "Choose a category below and we will be with you shortly.",
    color: data?.color,
    url: data?.url,
  });

  if (data?.timestamp) embed.setTimestamp(new Date(data.timestamp));
  if (data?.footer)
    embed.setFooter({
      text: data.footer.text,
      ...(data.footer.iconUrl ? { iconUrl: data.footer.iconUrl } : {}),
    });
  if (data?.author) {
    embed.setAuthor({
      name: data.author.name,
      ...(data.author.url ? { url: data.author.url } : {}),
      ...(data.author.iconUrl ? { iconUrl: data.author.iconUrl } : {}),
    });
  }
  if (data?.thumbnail) embed.setThumbnail(data.thumbnail.url);
  if (data?.image) embed.setImage(data.image.url);
  if (data?.fields?.length) {
    embed.addFields(
      data.fields.map((field) => ({
        name: field.name,
        value: field.value,
        ...(field.inline === undefined ? {} : { inline: field.inline }),
      })),
    );
  }
  return embed;
}

/**
 * Builds the published panel from the stored embed JSON and enabled categories.
 * Ownership is intentionally guild-scoped: panel routes are `ownerBound: false`
 * and re-check permissions at press time.
 */
export function buildTicketPanelView(
  panel: Pick<TicketPanelRecord, "guildId" | "type" | "embed"> & { channelId?: string },
  categories: readonly TicketCategoryRecord[],
  userId: string,
): TicketPanelView {
  const enabled = categories
    .filter((category) => category.enabled)
    .sort((a, b) => a.position - b.position)
    .slice(0, TICKET_DEFAULTS.maxCategories);
  if (enabled.length === 0) {
    throw new Error("A ticket panel needs at least one enabled category.");
  }

  const components: TicketPanelView["components"] = [];
  if (panel.type === "DROPDOWN") {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            buildCustomId({ module: "ticket", action: "select", guildId: panel.guildId, userId }),
          )
          .setPlaceholder("Choose a ticket category")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            enabled.map((category) => {
              const option = new StringSelectMenuOptionBuilder()
                .setLabel(safeLabel(category.name, 100))
                .setValue(category.id.slice(0, 100))
                .setDescription(safeLabel(category.description ?? "Open a ticket", 100));
              if (category.emoji) option.setEmoji(category.emoji);
              return option;
            }),
          ),
      ),
    );
  } else {
    for (let index = 0; index < enabled.length; index += TICKET_BUTTONS_PER_ROW) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const category of enabled.slice(index, index + TICKET_BUTTONS_PER_ROW)) {
        const button = new ButtonBuilder()
          .setCustomId(
            buildCustomId({
              module: "ticket",
              action: "start",
              guildId: panel.guildId,
              userId,
              args: [category.id],
            }),
          )
          .setLabel(safeLabel(category.name, 80))
          .setStyle(ButtonStyle.Primary);
        if (category.emoji) button.setEmoji(category.emoji);
        row.addComponents(button);
      }
      components.push(row);
    }
  }

  return { embeds: [panelEmbed(panel.embed)], components };
}

/** Buttons embedded in each newly created ticket channel; user-owned routes. */
export function buildTicketWelcomeView(input: {
  guildId: string;
  ticketId: string;
  userId: string;
  categoryName: string;
  number: number;
  ratingEnabled: boolean;
}): TicketPanelView {
  const id = (action: string): string =>
    buildCustomId({
      module: "ticket",
      action,
      guildId: input.guildId,
      userId: input.userId,
      args: [input.ticketId],
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id("close"))
      .setLabel("Close ticket")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(id("claim"))
      .setLabel("Claim ticket")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id("call"))
      .setLabel("Call staff")
      .setStyle(ButtonStyle.Secondary),
  );
  if (input.ratingEnabled) {
    row.addComponents(
      new ButtonBuilder().setCustomId(id("rate")).setLabel("Rate").setStyle(ButtonStyle.Success),
    );
  }

  const embed = baseEmbed({
    title: `Ticket #${input.number}`,
    description: `Thanks for contacting us${input.categoryName ? ` — **${safeLabel(input.categoryName, 100)}**` : ""}. Staff will reply here as soon as possible.`,
  });
  return { embeds: [embed], components: [row] };
}
