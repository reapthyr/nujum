import { handleChatInputCommand } from "../handlers/command";
import { handleButton, handleModal, handleSelectMenu } from "../handlers/interactions/component";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "interactionCreate",
  execute: async (client, interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction, client);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, client);
      return;
    }
    if (interaction.isAnySelectMenu()) {
      await handleSelectMenu(interaction, client);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction, client);
      return;
    }
    if (interaction.isAutocomplete()) {
      // Commands do not expose autocomplete yet; answer so Discord does not error.
      await interaction.respond([]).catch(() => undefined);
    }
  },
});
