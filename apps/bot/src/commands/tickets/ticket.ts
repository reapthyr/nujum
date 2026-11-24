import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  TICKET_PRIORITIES,
  ticketActionSchema,
  ticketBlacklistSchema,
  zEnum,
  type TicketAction,
} from "@nujum/shared";
import { baseEmbed, truncate } from "../../lib/embeds";
import { serializeError, toUserMessage } from "../../lib/errors";
import { defineCommand, withScope } from "../types";

const ACTION_CHOICES = [
  { name: "claim", value: "CLAIM" },
  { name: "close", value: "CLOSE" },
  { name: "add", value: "ADD_USER" },
  { name: "remove", value: "REMOVE_USER" },
  { name: "rename", value: "RENAME" },
  { name: "transfer", value: "TRANSFER" },
  { name: "priority", value: "PRIORITY" },
  { name: "note", value: "NOTE" },
  { name: "call", value: "CALL_STAFF" },
] as const satisfies ReadonlyArray<{ name: string; value: TicketAction }>;

export const command = defineCommand({
  name: "ticket",
  data: withScope(
    new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Ticket management: stats, close, add, remove, rename.")
      .addSubcommand((sub) =>
        sub.setName("stats").setDescription("Show ticket counts for this server."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("close")
          .setDescription("Close a ticket and save its transcript.")
          .addStringOption((option) =>
            option.setName("reason").setDescription("Closing reason").setMaxLength(300),
          ),
      )
      .addSubcommand((sub) => sub.setName("claim").setDescription("Claim the current ticket."))
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a member to the current ticket.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a member from the current ticket.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("rename")
          .setDescription("Rename the current ticket channel.")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("New channel name")
              .setRequired(true)
              .setMaxLength(100),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("transfer")
          .setDescription("Transfer the ticket to another staff member.")
          .addUserOption((option) =>
            option.setName("user").setDescription("New owner").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("priority")
          .setDescription("Change ticket priority.")
          .addStringOption((option) =>
            option
              .setName("value")
              .setDescription("Priority")
              .setRequired(true)
              .addChoices(
                ...TICKET_PRIORITIES.map((value) => ({ name: value.toLowerCase(), value })),
              ),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("note")
          .setDescription("Add a staff-only note.")
          .addStringOption((option) =>
            option.setName("content").setDescription("Note").setRequired(true).setMaxLength(1000),
          ),
      )
      .addSubcommand((sub) => sub.setName("call").setDescription("Call staff into the ticket."))
      .addSubcommand((sub) =>
        sub
          .setName("blacklist")
          .setDescription("Block a member from opening tickets.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(300),
          )
          .addIntegerOption((option) =>
            option
              .setName("minutes")
              .setDescription("Optional duration in minutes")
              .setMinValue(1)
              .setMaxValue(60 * 24 * 30),
          ),
      ),
    "guild",
  ),
  async execute({ interaction, client, logger }) {
    const guild = interaction.guild;
    if (!guild) return;
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (subcommand === "stats") {
        const stats = await client.tickets.stats(guild.id);
        await interaction.editReply({
          embeds: [
            baseEmbed({ title: "Ticket statistics" }).addFields(
              { name: "Open", value: String(stats.open), inline: true },
              { name: "Claimed", value: String(stats.claimed), inline: true },
              { name: "Closed", value: String(stats.closed), inline: true },
            ),
          ],
        });
        return;
      }

      if (subcommand === "blacklist") {
        const minutes = interaction.options.getInteger("minutes");
        await client.tickets.addBlacklist(
          guild,
          interaction.user.id,
          ticketBlacklistSchema.parse({
            userId: interaction.options.getUser("user", true).id,
            reason: interaction.options.getString("reason", true),
            ...(minutes ? { expiresAt: new Date(Date.now() + minutes * 60_000) } : {}),
          }),
        );
        await interaction.editReply({
          content: "The member can no longer open tickets.",
          embeds: [],
        });
        return;
      }

      const rawAction = ACTION_CHOICES.find((choice) => choice.name === subcommand);
      if (!rawAction) throw new Error("Unknown subcommand.");
      const payload = ticketActionSchema.parse({
        action: rawAction.value,
        ...(interaction.options.getUser("user")
          ? { userId: interaction.options.getUser("user", true).id }
          : {}),
        ...(subcommand === "rename" ? { name: interaction.options.getString("name", true) } : {}),
        ...(subcommand === "priority"
          ? {
              priority: zEnum(TICKET_PRIORITIES).parse(
                interaction.options.getString("value", true),
              ),
            }
          : {}),
        ...(interaction.options.getString("reason")
          ? { reason: interaction.options.getString("reason", true) }
          : {}),
        ...(subcommand === "note"
          ? { reason: interaction.options.getString("content", true) }
          : {}),
      });

      const ticket = await client.tickets.executeAction(guild, interaction.user.id, {
        channelId: interaction.channelId,
        ...payload,
      });
      logger.info(
        { guildId: guild.id, ticketId: ticket.id, action: payload.action },
        "ticket action completed",
      );
      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: "Ticket updated",
            description: `Ticket #${ticket.number} — ${payload.action.toLowerCase()}.`,
          }).setDescription(
            truncate(`Ticket #${ticket.number} — ${payload.action.toLowerCase()}.`, 200),
          ),
        ],
      });
    } catch (error) {
      logger.error({ err: serializeError(error), guildId: guild.id, subcommand }, "/ticket failed");
      await interaction
        .editReply({ content: truncate(toUserMessage(error), 300), embeds: [] })
        .catch(() => undefined);
    }
  },
});
