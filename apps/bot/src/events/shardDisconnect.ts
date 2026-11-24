import { defineEvent } from "./types";

export const event = defineEvent({
  name: "shardDisconnect",
  execute: (client, closeEvent, shardId) => {
    client.logger.warn(
      { shardId, code: closeEvent.code, reason: closeEvent.reason },
      "shard disconnected",
    );
  },
});
