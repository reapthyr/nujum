import { MessageFlags } from "discord.js";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from "discord.js";
import type { NujumClient } from "../../client/NujumClient";
import {
  isCustomIdOwner,
  matchesRoute,
  parseCustomId,
  type ParsedCustomId,
} from "../../lib/components";
import { errorEmbed } from "../../lib/embeds";
import { serializeError, toUserMessage } from "../../lib/errors";
import type { BotLogger } from "../../lib/logger";

const EXPIRED_MESSAGE =
  "This interaction has expired or is not available here. Run `/help` to start again.";

interface Routable {
  module: string;
  action: string;
  ownerBound?: boolean;
}

/** Repliable interactions that carry a custom id (buttons, selects, modals). */
type ComponentInteraction = RepliableInteraction & {
  customId: string;
  guildId: string | null;
};

interface ResolvedRoute<T> {
  parsed: ParsedCustomId;
  route: T;
  logger: BotLogger;
  requestId: string;
}

async function replyFailure(interaction: RepliableInteraction, message: string): Promise<void> {
  const payload = {
    embeds: [errorEmbed("Interaction failed", message)],
    flags: MessageFlags.Ephemeral,
  } as const;
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    // Token expired; nothing else to do.
  }
}

/** Ownership is always checked before a route runs; shared routes stay guild-bound. */
function authorize(
  route: Routable,
  parsed: ParsedCustomId,
  interaction: { user: { id: string }; guildId: string | null },
): boolean {
  if (parsed.guildId !== interaction.guildId) return false;
  if (route.ownerBound === false) return true;
  return isCustomIdOwner(parsed, { userId: interaction.user.id, guildId: interaction.guildId });
}

async function resolveRoute<T extends Routable>(
  interaction: ComponentInteraction,
  client: NujumClient,
  routes: Iterable<T>,
  kind: string,
): Promise<ResolvedRoute<T> | null> {
  const requestId = String(interaction.id);
  const logger = client.logger.child({
    requestId,
    component: interaction.customId,
    kind,
    userId: interaction.user.id,
    guildId: interaction.guildId,
  });

  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    logger.warn("unparseable component custom id");
    await replyFailure(interaction, EXPIRED_MESSAGE);
    return null;
  }

  const route = [...routes].find((candidate) => matchesRoute(parsed, candidate));
  if (!route) {
    logger.warn({ module: parsed.module, action: parsed.action }, "no route for component");
    await replyFailure(interaction, EXPIRED_MESSAGE);
    return null;
  }

  if (!authorize(route, parsed, interaction)) {
    logger.warn(
      { module: parsed.module, action: parsed.action, ownerId: parsed.userId },
      "component ownership check failed",
    );
    await replyFailure(
      interaction,
      "This component belongs to someone else. Run `/help` to get your own.",
    );
    return null;
  }

  return { parsed, route, logger, requestId };
}

export async function handleButton(
  interaction: ButtonInteraction,
  client: NujumClient,
): Promise<void> {
  const resolved = await resolveRoute(interaction, client, client.buttonRoutes.values(), "button");
  if (!resolved) return;
  try {
    await resolved.route.execute({
      interaction,
      client,
      logger: resolved.logger,
      requestId: resolved.requestId,
      parsed: resolved.parsed,
    });
  } catch (error) {
    resolved.logger.error({ err: serializeError(error) }, "button handler failed");
    await replyFailure(interaction, toUserMessage(error));
  }
}

export async function handleSelectMenu(
  interaction: AnySelectMenuInteraction,
  client: NujumClient,
): Promise<void> {
  const resolved = await resolveRoute(interaction, client, client.selectRoutes.values(), "select");
  if (!resolved) return;
  try {
    await resolved.route.execute({
      interaction,
      client,
      logger: resolved.logger,
      requestId: resolved.requestId,
      parsed: resolved.parsed,
    });
  } catch (error) {
    resolved.logger.error({ err: serializeError(error) }, "select handler failed");
    await replyFailure(interaction, toUserMessage(error));
  }
}

export async function handleModal(
  interaction: ModalSubmitInteraction,
  client: NujumClient,
): Promise<void> {
  const resolved = await resolveRoute(interaction, client, client.modalRoutes.values(), "modal");
  if (!resolved) return;
  try {
    await resolved.route.execute({
      interaction,
      client,
      logger: resolved.logger,
      requestId: resolved.requestId,
      parsed: resolved.parsed,
    });
  } catch (error) {
    resolved.logger.error({ err: serializeError(error) }, "modal handler failed");
    await replyFailure(interaction, toUserMessage(error));
  }
}
