import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { buildCustomId } from "../lib/components";
import { baseEmbed } from "../lib/embeds";
import type { JtcSettings } from "./types";

export interface JtcPanelView {
  embeds: EmbedBuilder[];
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
}

/** Shared JTC interface: routes are guild-bound and re-check room ownership. */
export function buildJtcPanelView(
  guildId: string,
  userId: string,
  settings: Pick<JtcSettings, "nameTemplate" | "defaultLimit" | "defaultBitrate">,
): JtcPanelView {
  const id = (action: string): string => buildCustomId({ module: "jtc", action, guildId, userId });

  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(id("lock")).setLabel("Lock").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id("unlock"))
      .setLabel("Unlock")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id("hide")).setLabel("Hide").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id("unhide"))
      .setLabel("Unhide")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id("claim"))
      .setLabel("Claim room")
      .setStyle(ButtonStyle.Success),
  );
  const limits = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("limit"))
      .setPlaceholder("Set voice limit")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        [0, 2, 5, 10, 25, 50, 99].map((value) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(value === 0 ? "Unlimited" : `${value} member${value === 1 ? "" : "s"}`)
            .setValue(String(value)),
        ),
      ),
  );

  const embed = baseEmbed({
    title: "Join-to-Create",
    description: [
      "Join the generator voice channel and your private room will be created automatically.",
      `Naming: \`${settings.nameTemplate}\` • Default limit: \`${settings.defaultLimit}\` • Bitrate: \`${settings.defaultBitrate}\` kbps`,
      "Use the controls below to manage your own room.",
    ].join("\n"),
  });

  return { embeds: [embed], components: [controls, limits] };
}
