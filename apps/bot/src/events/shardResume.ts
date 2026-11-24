import { defineEvent } from "./types";

export const event = defineEvent({
  name: "shardResume",
  execute: (client, shardId, replayedEvents) => {
    client.logger.info({ shardId, replayedEvents }, "shard resumed");
  },
});
