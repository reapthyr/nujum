import { MessageFlags } from "discord.js";
import { assertPermissions } from "../../../lib/permissions";
import { errorEmbed, successEmbed } from "../../../lib/embeds";
import { toUserMessage } from "../../../lib/errors";
import { deactivateLockdown } from "../../../security/lockdown";
import type { ButtonRoute } from "../types";

/**
 * Shared (guild-bound) route from the lockdown alert. The encoded user is the
 * guild owner, so anyone in the guild can press it — therefore the caller's
 * ManageGuild permission is re-checked here, never inferred from the custom id.
 */
export const securityUnlockButton: ButtonRoute = {
  module: "security",
  action: "unlock",
  ownerBound: false,
  async execute({ interaction, client }) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        embeds: [errorEmbed("Unavailable", "This action is only available in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const member = await guild.members.fetch(interaction.user.id);
      assertPermissions({
        member,
        channel: null,
        required: ["ManageGuild"],
        actor: "user",
      });

      const state = await client.security.lockdown(guild.id);
      if (!state.active) {
        await interaction.reply({
          embeds: [errorEmbed("No lockdown", "This server is not locked down.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const result = await deactivateLockdown(guild, client.security, client.logger, {
        reason: `Lockdown lifted by ${interaction.user.tag}`,
        actorId: interaction.user.id,
      });
      client.security.invalidate(guild.id);
      await interaction.reply({
        embeds: [
          successEmbed(
            "Lockdown lifted",
            `Restored ${result.changed} channel(s). This action was recorded in the audit log.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed("Could not unlock", toUserMessage(error))],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
