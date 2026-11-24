import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import type { NujumClient } from "../../client/NujumClient";
import type { ParsedCustomId } from "../../lib/components";
import type { BotLogger } from "../../lib/logger";

export interface InteractionContext<T> {
  interaction: T;
  client: NujumClient;
  logger: BotLogger;
  requestId: string;
  parsed: ParsedCustomId;
}

export interface ButtonRoute {
  module: string;
  action: string;
  /**
   * When true (default) only the user and guild encoded in the custom id may
   * use the component. Shared routes are still guild-bound.
   */
  ownerBound?: boolean;
  execute(context: InteractionContext<ButtonInteraction>): Promise<void>;
}

export interface SelectRoute {
  module: string;
  action: string;
  ownerBound?: boolean;
  execute(context: InteractionContext<AnySelectMenuInteraction>): Promise<void>;
}

export interface ModalRoute {
  module: string;
  action: string;
  ownerBound?: boolean;
  execute(context: InteractionContext<ModalSubmitInteraction>): Promise<void>;
}
