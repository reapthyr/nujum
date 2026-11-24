import type { ClientEvents } from "discord.js";
import type { NujumClient } from "../client/NujumClient";

export interface BotEvent {
  name: keyof ClientEvents;
  once: boolean;
  execute: (client: NujumClient, args: readonly unknown[]) => Promise<void>;
}

/**
 * Types the listener arguments for a specific gateway event while keeping the
 * registry itself simple. The cast is the only place event arguments lose
 * their precise tuple type.
 */
export function defineEvent<K extends keyof ClientEvents>(options: {
  name: K;
  once?: boolean;
  execute: (client: NujumClient, ...args: ClientEvents[K]) => Promise<void> | void;
}): BotEvent {
  return {
    name: options.name,
    once: options.once ?? false,
    execute: async (client, args) => {
      const typedArgs = args as unknown as ClientEvents[K];
      await options.execute(client, ...typedArgs);
    },
  };
}
