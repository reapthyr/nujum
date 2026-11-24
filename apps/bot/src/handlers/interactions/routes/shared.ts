import { MessageFlags, type RepliableInteraction } from "discord.js";
import { ApiActionError } from "../../../api/errors";
import { errorEmbed } from "../../../lib/embeds";
import { toUserMessage } from "../../../lib/errors";

/** Safe, structured failure reply for component routes. */
export async function replyRouteFailure(
  interaction: RepliableInteraction,
  title: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof ApiActionError ? error.message : toUserMessage(error);
  const payload = {
    embeds: [errorEmbed(title, message)],
    flags: MessageFlags.Ephemeral,
  } as const;
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    // Interaction token expired; nothing else to do.
  }
}
