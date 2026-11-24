import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { InteractionContextType } from "discord.js";
import { getCommandDefinition, type CommandDefinition, type CommandScope } from "@nujum/shared";
import type { NujumClient } from "../client/NujumClient";
import type { BotLogger } from "../lib/logger";

export type CommandData =
  SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  client: NujumClient;
  definition: CommandDefinition;
  logger: BotLogger;
  requestId: string;
  startedAt: number;
}

export interface Command {
  definition: CommandDefinition;
  data: CommandData;
  execute(context: CommandContext): Promise<void>;
}

/** Applies the shared command scope to the Discord context list. */
export function withScope<T extends CommandData>(builder: T, scope: CommandScope): T {
  switch (scope) {
    case "guild":
      builder.setContexts(InteractionContextType.Guild);
      break;
    case "dm":
      builder.setContexts(InteractionContextType.BotDM, InteractionContextType.PrivateChannel);
      break;
    case "both":
      builder.setContexts(
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      );
      break;
  }
  return builder;
}

/**
 * Binds a discord.js builder to its shared definition. The definition is the
 * single source of truth for permissions, cooldowns, scope and danger flags.
 */
export function defineCommand(options: {
  name: string;
  data: CommandData;
  execute: (context: CommandContext) => Promise<void>;
}): Command {
  const definition = getCommandDefinition(options.name);
  if (!definition) {
    throw new Error(`Command "${options.name}" is missing from the shared COMMANDS registry`);
  }
  if (options.data.name !== options.name) {
    throw new Error(
      `Command builder name "${options.data.name}" does not match registry entry "${options.name}"`,
    );
  }
  if (options.data.description.length === 0 || options.data.description.length > 100) {
    throw new Error(`Command "${options.name}" description must be 1-100 characters`);
  }

  return { definition, data: options.data, execute: options.execute };
}
