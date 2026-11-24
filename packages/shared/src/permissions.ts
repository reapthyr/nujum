/**
 * Single source of truth for command metadata: dashboard /help, bot handler
 * registration and permission re-checks all read from here.
 *
 * Discord permission names mirror `PermissionFlagsBits` keys from discord.js.
 * The bot maps them at startup and asserts the mapping is exhaustive.
 */

export const DISCORD_PERMISSIONS = [
  "AddReactions",
  "Administrator",
  "AttachFiles",
  "BanMembers",
  "ChangeNickname",
  "Connect",
  "CreateInstantInvite",
  "DeafenMembers",
  "EmbedLinks",
  "KickMembers",
  "ManageChannels",
  "ManageEmojisAndStickers",
  "ManageEvents",
  "ManageGuild",
  "ManageMessages",
  "ManageNicknames",
  "ManageRoles",
  "ManageThreads",
  "ManageWebhooks",
  "MentionEveryone",
  "ModerateMembers",
  "MoveMembers",
  "MuteMembers",
  "PrioritySpeaker",
  "ReadMessageHistory",
  "RequestToSpeak",
  "SendMessages",
  "SendMessagesInThreads",
  "Speak",
  "Stream",
  "UseApplicationCommands",
  "UseExternalEmojis",
  "UseExternalStickers",
  "UseVAD",
  "ViewAuditLog",
  "ViewChannel",
  "ViewGuildInsights",
] as const;

export type DiscordPermission = (typeof DISCORD_PERMISSIONS)[number];

export const COMMAND_CATEGORIES = [
  "moderation",
  "tickets",
  "utility",
  "configuration",
  "leveling",
  "community",
] as const;
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

export type CommandScope = "guild" | "dm" | "both";

export interface CommandRateLimit {
  /** Requests allowed per user inside the window. */
  perUser: number;
  /** Requests allowed per guild inside the window. */
  perGuild: number;
  /** Requests allowed globally per shard inside the window. */
  global: number;
  windowMs: number;
}

export interface CommandDefinition {
  /** Slash command name, without the leading slash. */
  name: string;
  description: string;
  category: CommandCategory;
  scope: CommandScope;
  /** Permissions the invoking member must hold (Administrator bypasses). */
  userPermissions: readonly DiscordPermission[];
  /** Permissions the bot must hold in the guild/channel. */
  botPermissions: readonly DiscordPermission[];
  ownerOnly: boolean;
  nsfw: boolean;
  /** Per-user cooldown in milliseconds (0 disables). */
  cooldownMs: number;
  rateLimit: CommandRateLimit;
  /** Requires an explicit confirmation button/flag. */
  dangerous: boolean;
}

const BASE_BOT: readonly DiscordPermission[] = [
  "ViewChannel",
  "SendMessages",
  "EmbedLinks",
  "ReadMessageHistory",
];

const MODERATION_RATE: CommandRateLimit = {
  perUser: 5,
  perGuild: 25,
  global: 100,
  windowMs: 10_000,
};
const DEFAULT_RATE: CommandRateLimit = {
  perUser: 3,
  perGuild: 15,
  global: 60,
  windowMs: 10_000,
};
const HEAVY_RATE: CommandRateLimit = {
  perUser: 1,
  perGuild: 3,
  global: 10,
  windowMs: 30_000,
};

function command(
  definition: Omit<CommandDefinition, "botPermissions" | "ownerOnly" | "nsfw" | "dangerous"> &
    Partial<Pick<CommandDefinition, "botPermissions" | "ownerOnly" | "nsfw" | "dangerous">>,
): CommandDefinition {
  return {
    botPermissions: BASE_BOT,
    ownerOnly: false,
    nsfw: false,
    dangerous: false,
    ...definition,
  };
}

export const COMMANDS: readonly CommandDefinition[] = [
  // ── moderation ────────────────────────────────────────────────────────────
  command({
    name: "ban",
    description: "Ban a member and open a moderation case.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["BanMembers"],
    botPermissions: [...BASE_BOT, "BanMembers"],
    cooldownMs: 5_000,
    rateLimit: MODERATION_RATE,
    dangerous: true,
  }),
  command({
    name: "kick",
    description: "Kick a member and open a moderation case.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["KickMembers"],
    botPermissions: [...BASE_BOT, "KickMembers"],
    cooldownMs: 5_000,
    rateLimit: MODERATION_RATE,
    dangerous: true,
  }),
  command({
    name: "timeout",
    description: "Time out a member for a duration.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ModerateMembers"],
    botPermissions: [...BASE_BOT, "ModerateMembers"],
    cooldownMs: 5_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "warn",
    description: "Warn a member, with escalation rules applied.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ModerateMembers"],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "unban",
    description: "Lift a ban by user ID.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["BanMembers"],
    botPermissions: [...BASE_BOT, "BanMembers"],
    cooldownMs: 5_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "softban",
    description: "Ban then immediately unban to delete recent messages.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["BanMembers"],
    botPermissions: [...BASE_BOT, "BanMembers"],
    cooldownMs: 5_000,
    rateLimit: MODERATION_RATE,
    dangerous: true,
  }),
  command({
    name: "purge",
    description: "Bulk delete messages with optional filters.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ManageMessages"],
    botPermissions: [...BASE_BOT, "ManageMessages"],
    cooldownMs: 5_000,
    rateLimit: MODERATION_RATE,
    dangerous: true,
  }),
  command({
    name: "slowmode",
    description: "Set channel slowmode.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ManageChannels"],
    botPermissions: [...BASE_BOT, "ManageChannels"],
    cooldownMs: 3_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "lock",
    description: "Lock a channel so members cannot speak.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ManageChannels"],
    botPermissions: [...BASE_BOT, "ManageChannels"],
    cooldownMs: 3_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "unlock",
    description: "Unlock a previously locked channel.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ManageChannels"],
    botPermissions: [...BASE_BOT, "ManageChannels"],
    cooldownMs: 3_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "nick",
    description: "Change or reset a member's nickname.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ManageNicknames"],
    botPermissions: [...BASE_BOT, "ManageNicknames"],
    cooldownMs: 3_000,
    rateLimit: MODERATION_RATE,
  }),
  command({
    name: "case",
    description: "View or update a moderation case.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ModerateMembers"],
    botPermissions: BASE_BOT,
    cooldownMs: 2_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "modlogs",
    description: "List recent moderation cases for a member.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ModerateMembers"],
    botPermissions: BASE_BOT,
    cooldownMs: 2_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "warnings",
    description: "Show active warnings for a member.",
    category: "moderation",
    scope: "guild",
    userPermissions: ["ModerateMembers"],
    botPermissions: BASE_BOT,
    cooldownMs: 2_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "appeal",
    description: "Appeal a moderation case.",
    category: "moderation",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 30_000,
    rateLimit: HEAVY_RATE,
  }),

  // ── tickets ───────────────────────────────────────────────────────────────
  command({
    name: "ticket",
    description: "Ticket management: stats, close, add, remove, rename.",
    category: "tickets",
    scope: "guild",
    userPermissions: [],
    botPermissions: [...BASE_BOT, "ManageChannels"],
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "panel",
    description: "Publish or refresh a ticket panel.",
    category: "tickets",
    scope: "guild",
    userPermissions: ["ManageGuild"],
    botPermissions: [...BASE_BOT, "ManageChannels"],
    cooldownMs: 10_000,
    rateLimit: HEAVY_RATE,
  }),

  // ── community ─────────────────────────────────────────────────────────────
  command({
    name: "rank",
    description: "Show your XP rank card.",
    category: "leveling",
    scope: "guild",
    userPermissions: [],
    botPermissions: [...BASE_BOT, "AttachFiles"],
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "leaderboard",
    description: "Show the server XP leaderboard.",
    category: "leveling",
    scope: "guild",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 5_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "giveaway",
    description: "Create, end or reroll a giveaway.",
    category: "community",
    scope: "guild",
    userPermissions: ["ManageGuild"],
    botPermissions: [...BASE_BOT, "AddReactions"],
    cooldownMs: 5_000,
    rateLimit: HEAVY_RATE,
  }),
  command({
    name: "suggest",
    description: "Submit a suggestion.",
    category: "community",
    scope: "guild",
    userPermissions: [],
    botPermissions: [...BASE_BOT, "AddReactions"],
    cooldownMs: 10_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "poll",
    description: "Create a poll.",
    category: "community",
    scope: "guild",
    userPermissions: [],
    botPermissions: [...BASE_BOT, "AddReactions"],
    cooldownMs: 5_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "birthday",
    description: "Set or clear your birthday.",
    category: "community",
    scope: "guild",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),

  // ── utility ───────────────────────────────────────────────────────────────
  command({
    name: "remind",
    description: "Create a personal reminder.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "afk",
    description: "Set an AFK status.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "help",
    description: "Browse commands or get details for one command.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 1_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "ping",
    description: "Show gateway and API latency.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 2_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "botinfo",
    description: "Show bot version, uptime and shard information.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "invite",
    description: "Get the bot invite link.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "support",
    description: "Get the support server link.",
    category: "utility",
    scope: "both",
    userPermissions: [],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),

  // ── configuration ─────────────────────────────────────────────────────────
  command({
    name: "settings",
    description: "Open the server settings hub.",
    category: "configuration",
    scope: "guild",
    userPermissions: ["ManageGuild"],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "security",
    description: "View or toggle security protections.",
    category: "configuration",
    scope: "guild",
    userPermissions: ["ManageGuild"],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "logging",
    description: "Configure the logging module.",
    category: "configuration",
    scope: "guild",
    userPermissions: ["ManageGuild"],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
  command({
    name: "welcome",
    description: "Configure welcome and goodbye messages.",
    category: "configuration",
    scope: "guild",
    userPermissions: ["ManageGuild"],
    botPermissions: BASE_BOT,
    cooldownMs: 3_000,
    rateLimit: DEFAULT_RATE,
  }),
] as const;

export const COMMAND_MAP: ReadonlyMap<string, CommandDefinition> = new Map(
  COMMANDS.map((definition) => [definition.name, definition]),
);

export const COMMAND_NAMES: readonly string[] = COMMANDS.map((definition) => definition.name);

export function getCommandDefinition(name: string): CommandDefinition | undefined {
  return COMMAND_MAP.get(name);
}

export function commandsByCategory(category: CommandCategory): readonly CommandDefinition[] {
  return COMMANDS.filter((definition) => definition.category === category);
}

/**
 * Checks a member's permission set. `Administrator` implies every permission.
 * The input may be a Set of names or a serialized bitfield converted upstream.
 */
export function hasDiscordPermissions(
  memberPermissions: ReadonlySet<string>,
  required: readonly DiscordPermission[],
): boolean {
  if (required.length === 0) return true;
  if (memberPermissions.has("Administrator")) return true;
  return required.every((permission) => memberPermissions.has(permission));
}

export function missingDiscordPermissions(
  memberPermissions: ReadonlySet<string>,
  required: readonly DiscordPermission[],
): DiscordPermission[] {
  if (memberPermissions.has("Administrator")) return [];
  return required.filter((permission) => !memberPermissions.has(permission));
}
