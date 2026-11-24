import type { NujumClient } from "./NujumClient";
import { loadDirectoryModules } from "../lib/loader";
import type { Command } from "../commands/types";
import type { BotEvent } from "../events/types";
import { serializeError } from "../lib/errors";
import { join } from "node:path";

/** Loads every command module and validates uniqueness at boot. */
export async function loadCommands(client: NujumClient): Promise<number> {
  const commands = await loadDirectoryModules<Command>(
    join(__dirname, "..", "commands"),
    "command",
  );
  for (const command of commands) {
    const { name } = command.definition;
    if (client.commands.has(name)) {
      throw new Error(`Duplicate command registration: ${name}`);
    }
    client.commands.set(name, command);
  }

  client.logger.info(
    { count: client.commands.size, commands: [...client.commands.keys()].sort() },
    "slash commands loaded",
  );
  return client.commands.size;
}

/** Registers every event module. Listener errors are logged, never unhandled. */
export async function loadEvents(client: NujumClient): Promise<number> {
  const events = await loadDirectoryModules<BotEvent>(join(__dirname, "..", "events"), "event");
  const seen = new Set<string>();

  for (const event of events) {
    if (seen.has(event.name)) {
      throw new Error(`Duplicate event registration: ${event.name}`);
    }
    seen.add(event.name);

    const run = (...args: unknown[]): void => {
      void event.execute(client, args).catch((error: unknown) => {
        client.logger.error(
          { err: serializeError(error), event: event.name },
          "gateway event handler failed",
        );
      });
    };

    if (event.once) {
      client.once(event.name, run);
    } else {
      client.on(event.name, run);
    }
  }

  client.logger.info({ count: seen.size, events: [...seen].sort() }, "gateway events loaded");
  return seen.size;
}
