import { Client, Collection, GatewayIntentBits, Partials, type ClientOptions } from "discord.js";
import type { BotEnv } from "../config/env";
import type { BotLogger } from "../lib/logger";
import { CooldownStore, CommandRateLimiter } from "../lib/cooldowns";
import type { Command } from "../commands/types";
import type { ButtonRoute, ModalRoute, SelectRoute } from "../handlers/interactions/types";
import { PrismaSecurityRepository } from "../security/repository";
import { GuildSecurityService } from "../security/service";
import { RaidDetector } from "../security/raid";
import { SpamDetector } from "../security/spam";
import { NukeDetector } from "../security/nuke";
import { SecurityThrottle } from "../security/throttle";
import { VerificationService } from "../security/verification/service";
import { ModuleService } from "../lib/modules";
import { DiscordLiveActions } from "../api/live-actions";
import { DatabaseQueueService } from "../api/queue";

/**
 * Intents are deliberately minimal and documented in docs/bot.md.
 * `GuildMembers` and `MessageContent` are privileged and must be enabled in the
 * Discord developer portal; features degrade gracefully when they are absent.
 */
export const REQUIRED_INTENTS: readonly GatewayIntentBits[] = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.DirectMessages,
];

export const REQUIRED_PARTIALS: readonly Partials[] = [
  Partials.Channel,
  Partials.GuildMember,
  Partials.Message,
  Partials.Reaction,
  Partials.User,
];

function buildClientOptions(env: BotEnv): ClientOptions {
  const shardsFromManager = process.env.SHARDS
    ? process.env.SHARDS.split(",")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value >= 0)
    : [];

  const shardIds = env.SHARD_IDS.length > 0 ? env.SHARD_IDS : shardsFromManager;

  return {
    intents: [...REQUIRED_INTENTS],
    partials: [...REQUIRED_PARTIALS],
    allowedMentions: { parse: [], repliedUser: false },
    failIfNotExists: false,
    ...(shardIds.length > 0 ? { shards: [...shardIds] } : {}),
    ...(env.SHARD_COUNT > 1 ? { shardCount: env.SHARD_COUNT } : {}),
  };
}

export class NujumClient extends Client {
  readonly env: BotEnv;
  readonly logger: BotLogger;
  readonly commands = new Collection<string, Command>();
  readonly buttonRoutes = new Collection<string, ButtonRoute>();
  readonly selectRoutes = new Collection<string, SelectRoute>();
  readonly modalRoutes = new Collection<string, ModalRoute>();
  readonly cooldowns = new CooldownStore();
  readonly rateLimiter = new CommandRateLimiter();
  readonly security: GuildSecurityService;
  readonly verification: VerificationService;
  readonly modules: ModuleService;
  readonly raidDetector = new RaidDetector();
  readonly spamDetector = new SpamDetector();
  readonly nukeDetector = new NukeDetector();
  readonly securityThrottle = new SecurityThrottle();
  readonly liveActions: DiscordLiveActions;
  readonly queue: DatabaseQueueService;
  readonly owners: ReadonlySet<string>;
  readonly startedAt = Date.now();

  constructor(env: BotEnv, logger: BotLogger) {
    super(buildClientOptions(env));
    this.env = env;
    this.logger = logger;
    this.owners = new Set(env.OWNER_IDS);
    this.security = new GuildSecurityService(new PrismaSecurityRepository(), logger);
    this.verification = new VerificationService(logger);
    this.modules = new ModuleService(logger);
    this.liveActions = new DiscordLiveActions(this, logger);
    this.queue = new DatabaseQueueService(this.liveActions, logger);
  }

  get uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  isOwner(userId: string): boolean {
    return this.owners.has(userId);
  }

  /** Safe shutdown used by SIGINT/SIGTERM and fatal handlers. */
  async shutdown(reason: string): Promise<void> {
    this.logger.info({ reason }, "destroying gateway connection");
    await this.destroy();
  }
}
