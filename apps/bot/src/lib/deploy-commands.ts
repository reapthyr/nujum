import { REST, Routes } from "discord.js";
import type { Command } from "../commands/types";
import type { BotLogger } from "./logger";

export interface DeployCommandsOptions {
  token: string;
  applicationId: string;
  /** When set, registers instantly to this guild (development). */
  guildId?: string | null;
  commands: Iterable<Command>;
  logger: BotLogger;
}

const DISCORD_COMMAND_LIMIT = 100;

/**
 * Registers the slash command manifest. Global commands can take up to an hour
 * to appear; guild commands are instant and used for development.
 */
export async function deployCommands(options: DeployCommandsOptions): Promise<number> {
  const body = [...options.commands]
    .map((command) => command.data.toJSON())
    .sort((left, right) => left.name.localeCompare(right.name));

  if (body.length === 0) throw new Error("Refusing to deploy an empty command manifest");
  if (body.length > DISCORD_COMMAND_LIMIT) {
    throw new Error(`Discord allows at most ${DISCORD_COMMAND_LIMIT} global commands`);
  }

  const rest = new REST({ version: "10", timeout: 20_000 }).setToken(options.token);
  const route = options.guildId
    ? Routes.applicationGuildCommands(options.applicationId, options.guildId)
    : Routes.applicationCommands(options.applicationId);

  await rest.put(route, { body });

  options.logger.info(
    {
      count: body.length,
      scope: options.guildId ? "guild" : "global",
      guildId: options.guildId ?? null,
    },
    "slash commands deployed",
  );
  return body.length;
}
