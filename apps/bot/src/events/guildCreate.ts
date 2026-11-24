import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { BRAND } from "@nujum/shared";
import { baseEmbed } from "../lib/embeds";
import { serializeError } from "../lib/errors";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "guildCreate",
  execute: async (client, guild) => {
    client.logger.info(
      {
        guildId: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      },
      "joined guild",
    );

    const me = guild.members.me;
    const channel = guild.systemChannel;
    if (!channel || !me) return;
    if (!channel.permissionsFor(me)?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) return;

    const embed = baseEmbed({
      title: `Thanks for adding ${BRAND.name}!`,
      description: [
        `${BRAND.tagline}`,
        "",
        "Finish setup in the dashboard: pick modules, configure security and connect your log channels.",
        "",
        `**Dashboard:** ${BRAND.website}`,
        `**Documentation:** ${BRAND.docs}`,
      ].join("\n"),
    });

    const dashboard = new ButtonBuilder()
      .setLabel("Open dashboard")
      .setStyle(ButtonStyle.Link)
      .setURL(BRAND.website);
    const help = new ButtonBuilder()
      .setLabel("Command list")
      .setStyle(ButtonStyle.Link)
      .setURL(BRAND.docs);

    await channel
      .send({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(dashboard, help)],
      })
      .catch((error: unknown) => {
        client.logger.debug(
          { err: serializeError(error), guildId: guild.id },
          "welcome message failed",
        );
      });
  },
});
