import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { buildCustomId } from "../../lib/components";
import { baseEmbed } from "../../lib/embeds";
import type { VerificationSettings } from "./types";

export function verificationPanel(
  settings: VerificationSettings,
  guildId: string,
  ownerId: string,
) {
  const embed = baseEmbed({
    title: "Verify to continue",
    description: settings.message,
  }).addFields(
    {
      name: "Method",
      value:
        settings.mode === "CAPTCHA"
          ? "Solve the code sent to your DMs."
          : settings.mode === "ACCOUNT_AGE"
            ? `Your account must be at least ${settings.minAccountAgeDays} day(s) old.`
            : "Press the button below.",
      inline: false,
    },
    {
      name: "Privacy",
      value: "No role is granted until verification completes. Your code is stored as a hash.",
      inline: false,
    },
  );

  const button = new ButtonBuilder()
    .setCustomId(
      buildCustomId({
        module: "verify",
        action: "start",
        guildId,
        // Shared panel button: route is guild-bound, not owner-bound. The id
        // owner is the guild owner so the id is still a valid snowflake.
        userId: ownerId,
      }),
    )
    .setLabel("Verify")
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}
