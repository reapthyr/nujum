import { defineEvent } from "./types";

export const event = defineEvent({
  name: "warn",
  execute: (client, message) => {
    client.logger.warn({ message }, "discord client warning");
  },
});
