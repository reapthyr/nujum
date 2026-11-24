import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
} from "discord.js";
import type { NujumClient } from "../../../client/NujumClient";
import { buildCustomId } from "../../../lib/components";
import { successEmbed } from "../../../lib/embeds";
import type { ButtonRoute, ModalRoute, SelectRoute } from "../types";
import { replyRouteFailure } from "./shared";

async function openTicket(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  client: NujumClient,
  categoryId: string | undefined,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  try {
    if (!categoryId) throw new Error("Select a valid ticket category.");
    const ticket = await client.tickets.createTicket(
      guild,
      categoryId,
      interaction.user.id,
      interaction.user.id,
    );
    await interaction.reply({
      embeds: [successEmbed("Ticket opened", `Your ticket is ready at <#${ticket.channelId}>.`)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    await replyRouteFailure(interaction, "Could not open a ticket", error);
  }
}

/** Shared panel buttons: anyone in the guild may start a ticket. */
export const ticketStartButton: ButtonRoute = {
  module: "ticket",
  action: "start",
  ownerBound: false,
  async execute({ interaction, client, parsed }) {
    await openTicket(interaction, client, parsed.args[0]);
  },
};

/** Shared panel select: same guild scope, same service-side validation. */
export const ticketSelectMenu: SelectRoute = {
  module: "ticket",
  action: "select",
  ownerBound: false,
  async execute({ interaction, client }) {
    await openTicket(interaction, client, interaction.values[0]);
  },
};

function ticketActionButton(action: "close" | "claim" | "call", title: string): ButtonRoute {
  return {
    module: "ticket",
    action,
    ownerBound: true,
    async execute({ interaction, client, parsed, logger }) {
      const guild = interaction.guild;
      if (!guild) return;
      const ticketId = parsed.args[0];
      try {
        if (!ticketId) throw new Error("This ticket is no longer available.");
        const ticket = await client.tickets.executeAction(guild, interaction.user.id, {
          ticketId,
          action: action === "close" ? "CLOSE" : action === "claim" ? "CLAIM" : "CALL_STAFF",
        });
        logger.info({ guildId: guild.id, ticketId: ticket.id, action }, "ticket button action");
        await interaction.reply({
          embeds: [
            successEmbed("Ticket updated", `Ticket #${ticket.number} — ${title.toLowerCase()}.`),
          ],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await replyRouteFailure(interaction, title, error);
      }
    },
  };
}

export const ticketCloseButton = ticketActionButton("close", "Close ticket");
export const ticketClaimButton = ticketActionButton("claim", "Claim ticket");
export const ticketCallButton = ticketActionButton("call", "Staff called");

/** Owner-bound rating flow: the opener supplies 1-5 and an optional comment. */
export const ticketRateButton: ButtonRoute = {
  module: "ticket",
  action: "rate",
  ownerBound: true,
  async execute({ interaction, parsed }) {
    const guild = interaction.guild;
    if (!guild) return;
    const ticketId = parsed.args[0];
    if (!ticketId) {
      await replyRouteFailure(interaction, "Rate ticket", new Error("Ticket not found."));
      return;
    }
    try {
      const modal = new ModalBuilder()
        .setCustomId(
          buildCustomId({
            module: "ticket",
            action: "rating",
            guildId: guild.id,
            userId: interaction.user.id,
            args: [ticketId],
          }),
        )
        .setTitle("Rate your ticket")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("rating")
              .setLabel("Rating (1-5)")
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(1)
              .setRequired(true),
            new TextInputBuilder()
              .setCustomId("comment")
              .setLabel("Comment (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(1000)
              .setRequired(false),
          ),
        );
      await interaction.showModal(modal);
    } catch (error) {
      await replyRouteFailure(interaction, "Rate ticket", error);
    }
  },
};

export const ticketRatingModal: ModalRoute = {
  module: "ticket",
  action: "rating",
  ownerBound: true,
  async execute({ interaction, client, parsed }) {
    const guild = interaction.guild;
    if (!guild) return;
    const ticketId = parsed.args[0];
    try {
      if (!ticketId) throw new Error("Ticket not found.");
      const rating = Number(interaction.fields.getTextInputValue("rating"));
      const comment = interaction.fields.getTextInputValue("comment").trim();
      await client.tickets.rateTicket(guild, interaction.user.id, ticketId, {
        rating,
        ...(comment ? { comment } : {}),
      });
      await interaction.reply({
        embeds: [successEmbed("Thanks for your feedback", "Your rating was recorded.")],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await replyRouteFailure(interaction, "Rate ticket", error);
    }
  },
};
