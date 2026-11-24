import { MessageFlags } from "discord.js";
import type { JtcAction } from "@nujum/shared";
import { successEmbed } from "../../../lib/embeds";
import type { ButtonRoute, SelectRoute } from "../types";
import { replyRouteFailure } from "./shared";

/**
 * Shared JTC interface routes. The custom id encodes the publisher, but every
 * action is resolved against the *invoker's* own room in `JtcService`, and the
 * service re-checks Discord ownership/permissions before mutating anything.
 */
function jtcButton(
  action: Extract<JtcAction, "LOCK" | "UNLOCK" | "HIDE" | "UNHIDE" | "CLAIM">,
): ButtonRoute {
  return {
    module: "jtc",
    action: action.toLowerCase(),
    ownerBound: false,
    async execute({ interaction, client }) {
      const guild = interaction.guild;
      if (!guild) return;
      try {
        const result = await client.jtc.applyAction(guild, interaction.user.id, { action });
        await interaction.reply({
          embeds: [
            successEmbed(
              "Room updated",
              result.detail ??
                `${action.toLowerCase()} ${action === "CLAIM" ? "requested" : "applied"}.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await replyRouteFailure(interaction, "Room control failed", error);
      }
    },
  };
}

export const jtcLockButton = jtcButton("LOCK");
export const jtcUnlockButton = jtcButton("UNLOCK");
export const jtcHideButton = jtcButton("HIDE");
export const jtcUnhideButton = jtcButton("UNHIDE");
export const jtcClaimButton = jtcButton("CLAIM");

export const jtcLimitSelect: SelectRoute = {
  module: "jtc",
  action: "limit",
  ownerBound: false,
  async execute({ interaction, client }) {
    const guild = interaction.guild;
    if (!guild) return;
    try {
      const value = Number(interaction.values[0]);
      await client.jtc.applyAction(guild, interaction.user.id, { action: "LIMIT", value });
      await interaction.reply({
        embeds: [successEmbed("Room limit updated", `Voice limit set to ${value}.`)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await replyRouteFailure(interaction, "Room limit failed", error);
    }
  },
};
