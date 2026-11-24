import { serializeError } from "../lib/errors";
import { defineEvent } from "./types";

export const event = defineEvent({
  name: "error",
  execute: (client, error) => {
    client.logger.error({ err: serializeError(error) }, "discord client error");
  },
});
