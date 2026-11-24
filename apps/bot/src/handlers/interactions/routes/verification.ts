import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { z } from "zod";
import { buildCustomId } from "../../../lib/components";
import { errorEmbed, successEmbed } from "../../../lib/embeds";
import { serializeError } from "../../../lib/errors";
import { grantVerificationRole, meetsAccountAge } from "../../../security/verification/grant";
import type { ButtonRoute, ModalRoute } from "../types";

const codeSchema = z.string().regex(/^\d{6}$/);
const FAILURE = "Verification is temporarily unavailable. Please try again later.";

/** Shared panel button: ownership is guild-scoped, not user-scoped. */
export const verificationStartButton: ButtonRoute = {
  module: "verify",
  action: "start",
  ownerBound: false,
  async execute({ interaction, client }) {
    const guild = interaction.guild;
    if (!guild) return;

    try {
      if (!(await client.modules.isEnabled(guild.id, "VERIFICATION"))) {
        await interaction.reply({
          embeds: [errorEmbed("Verification", "Verification is not enabled on this server.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await client.verification.settings(guild.id);
      if (!settings.enabled || !settings.roleId) {
        await interaction.reply({
          embeds: [errorEmbed("Verification", "Verification is not set up on this server yet.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!meetsAccountAge(interaction.user, settings.minAccountAgeDays, Date.now())) {
        await interaction.reply({
          embeds: [
            errorEmbed(
              "Account too new",
              `Your account must be at least ${settings.minAccountAgeDays} day(s) old.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (settings.mode === "CAPTCHA") {
        const { code } = await client.verification.begin(guild.id, interaction.user.id, "CAPTCHA");
        if (!code) throw new Error("CAPTCHA code was not generated");
        try {
          await interaction.user.send({
            content: `Your ${guild.name} verification code is \`${code}\`. It expires in 10 minutes and can only be used once.`,
            allowedMentions: { parse: [] },
          });
        } catch {
          await interaction.reply({
            embeds: [
              errorEmbed(
                "DMs required",
                "Enable direct messages from server members, then press the button again.",
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(
            buildCustomId({
              module: "verify",
              action: "code",
              guildId: guild.id,
              userId: interaction.user.id,
            }),
          )
          .setTitle("Verify your account")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("code")
                .setLabel("6-digit code")
                .setStyle(TextInputStyle.Short)
                .setMinLength(6)
                .setMaxLength(6)
                .setRequired(true),
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      await client.verification.begin(guild.id, interaction.user.id, settings.mode);
      await client.verification.markVerified(guild.id, interaction.user.id);
      const result = await grantVerificationRole(client, guild, interaction.user.id, settings);
      await interaction.reply({
        embeds: [
          result.granted
            ? successEmbed("Verified", result.reason)
            : errorEmbed("Verification failed", result.reason),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: interaction.user.id },
        "verification button failed",
      );
      if (interaction.deferred || interaction.replied) return;
      try {
        await interaction.reply({
          embeds: [errorEmbed("Verification failed", FAILURE)],
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        // Interaction token expired.
      }
    }
  },
};

/** Owner-bound modal: only the member who received the code can submit it. */
export const verificationCodeModal: ModalRoute = {
  module: "verify",
  action: "code",
  ownerBound: true,
  async execute({ interaction, client }) {
    const guild = interaction.guild;
    if (!guild) return;

    try {
      if (!(await client.modules.isEnabled(guild.id, "VERIFICATION"))) {
        await interaction.reply({
          embeds: [errorEmbed("Verification", "Verification is no longer enabled on this server.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const parsed = codeSchema.safeParse(interaction.fields.getTextInputValue("code"));
      if (!parsed.success) {
        await interaction.reply({
          embeds: [errorEmbed("Invalid code", "Enter the exact 6-digit code from your DMs.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const result = await client.verification.checkCode(
        guild.id,
        interaction.user.id,
        parsed.data,
      );
      if (!result.ok) {
        const messages = {
          "no-session": "Start verification again with the button.",
          expired: "That code expired. Press the button to get a new one.",
          verified: "You are already verified.",
          "too-many-attempts": "Too many attempts. Press the button to get a new code.",
          "invalid-code": `Incorrect code. ${result.attemptsLeft} attempt(s) left.`,
        } as const;
        await interaction.reply({
          embeds: [errorEmbed("Verification failed", messages[result.reason])],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const settings = await client.verification.settings(guild.id);
      if (!settings.enabled || !settings.roleId) {
        await interaction.reply({
          embeds: [errorEmbed("Verification", "Verification is no longer set up on this server.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const granted = await grantVerificationRole(client, guild, interaction.user.id, settings);
      await interaction.reply({
        embeds: [
          granted.granted
            ? successEmbed("Verified", granted.reason)
            : errorEmbed("Verification failed", granted.reason),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: interaction.user.id },
        "verification modal failed",
      );
      try {
        await interaction.reply({
          embeds: [errorEmbed("Verification failed", FAILURE)],
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        // Interaction token expired.
      }
    }
  },
};
