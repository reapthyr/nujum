import { MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import type { CommandDefinition } from "@nujum/shared";
import type { NujumClient } from "../client/NujumClient";
import { BotError, ERROR_CODES, serializeError, toUserMessage } from "../lib/errors";
import { errorEmbed } from "../lib/embeds";
import { assertPermissions } from "../lib/permissions";

export async function replyWithError(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  const payload = {
    embeds: [errorEmbed("Command failed", message)],
    flags: MessageFlags.Ephemeral,
  } as const;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // The interaction token expired or the channel was deleted; nothing to do.
  }
}

async function fetchMember(
  guild: NonNullable<ChatInputCommandInteraction["guild"]>,
  userId: string,
): Promise<GuildMember | undefined> {
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch {
    return guild.members.cache.get(userId);
  }
}

/** Enforces scope, ownership and Discord permissions immediately before execution. */
async function enforceCommandAccess(
  client: NujumClient,
  interaction: ChatInputCommandInteraction,
  definition: CommandDefinition,
): Promise<void> {
  if (definition.scope === "guild" && !interaction.inGuild()) {
    throw new BotError(ERROR_CODES.guildOnly, "This command only works inside a server.");
  }
  if (definition.scope === "dm" && interaction.inGuild()) {
    throw new BotError(ERROR_CODES.dmOnly, "This command only works in direct messages.");
  }
  if (definition.ownerOnly && !client.isOwner(interaction.user.id)) {
    throw new BotError(ERROR_CODES.ownerOnly, "This command is restricted to Nujum owners.");
  }
  if (definition.nsfw) {
    const channel = interaction.channel;
    if (!channel || !("nsfw" in channel) || channel.nsfw !== true) {
      throw new BotError(
        ERROR_CODES.nsfwOnly,
        "This command can only be used in age-restricted channels.",
      );
    }
  }

  if (!interaction.inGuild()) return;

  const guild = interaction.guild;
  const botUser = client.user;
  if (!guild || !botUser) {
    throw new BotError(ERROR_CODES.internal, "This command is not available right now.");
  }

  const member = await fetchMember(guild, interaction.user.id);
  if (!member) {
    throw new BotError(ERROR_CODES.internal, "I could not verify your membership in this server.");
  }
  const me = guild.members.me ?? (await fetchMember(guild, botUser.id));
  if (!me) {
    throw new BotError(
      ERROR_CODES.internal,
      "I could not verify my own permissions in this server.",
    );
  }

  const channel =
    interaction.channel && "permissionsFor" in interaction.channel ? interaction.channel : null;

  assertPermissions({ member, channel, required: definition.userPermissions, actor: "user" });
  assertPermissions({ member: me, channel, required: definition.botPermissions, actor: "bot" });
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction,
  client: NujumClient,
): Promise<void> {
  const requestId = String(interaction.id);
  const logger = client.logger.child({
    requestId,
    command: interaction.commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId,
  });
  const startedAt = Date.now();

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    await replyWithError(
      interaction,
      "This command is not available yet. Run `/help` for the current list.",
    );
    return;
  }

  const { definition } = command;

  try {
    await enforceCommandAccess(client, interaction, definition);

    const cooldownKey = `${definition.name}:${interaction.user.id}`;
    const cooldown = client.cooldowns.remaining(cooldownKey);
    if (cooldown > 0) {
      throw new BotError(
        ERROR_CODES.cooldown,
        `This command is on cooldown. Try again in ${(cooldown / 1000).toFixed(1)}s.`,
        { meta: { cooldownMs: cooldown } },
      );
    }

    const verdict = client.rateLimiter.check(definition, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    if (!verdict.allowed) {
      throw new BotError(
        ERROR_CODES.rateLimited,
        `You are using commands too quickly. Try again in ${Math.ceil(verdict.retryAfterMs / 1000)}s.`,
        { meta: { blockedBy: verdict.blockedBy } },
      );
    }

    client.cooldowns.start(cooldownKey, definition.cooldownMs);

    await command.execute({
      interaction,
      client,
      definition,
      logger,
      requestId,
      startedAt,
    });

    logger.debug({ durationMs: Date.now() - startedAt, success: true }, "slash command completed");
  } catch (error) {
    logger.warn(
      { err: serializeError(error), durationMs: Date.now() - startedAt },
      "slash command failed",
    );
    await replyWithError(interaction, toUserMessage(error));
  }
}
