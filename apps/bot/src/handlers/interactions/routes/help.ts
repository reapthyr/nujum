import { buildHelpView } from "../../../lib/views/help";
import type { ButtonRoute } from "../types";

/** Refresh button under /help. Owner-bound: only the invoker can press it. */
export const helpRefreshButton: ButtonRoute = {
  module: "help",
  action: "refresh",
  ownerBound: true,
  async execute({ interaction, client, parsed }) {
    const view = buildHelpView(client, {
      userId: parsed.userId,
      guildId: parsed.guildId,
    });
    await interaction.update({ embeds: view.embeds, components: view.components });
  },
};
