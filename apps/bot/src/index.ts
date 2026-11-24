import "dotenv/config";
import { EnvValidationError } from "@nujum/shared/env";
import { disconnectPrisma } from "@nujum/shared/prisma";
import { createApiServer } from "./api/server";
import { NujumClient } from "./client/NujumClient";
import { loadCommands, loadEvents } from "./client/loaders";
import { BOT_VERSION } from "./config/constants";
import { loadEnv, type BotEnv } from "./config/env";
import { ConfigWatcher } from "./config/watcher";
import { installProcessGuards } from "./core/runtime";
import { ShutdownManager } from "./core/shutdown";
import { registerInteractionRoutes } from "./handlers/interactions/routes";
import { createDatabaseHealth } from "./lib/database";
import { serializeError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { assertPermissionRegistry } from "./lib/permissions";

function fatalStartup(error: unknown): never {
  if (error instanceof EnvValidationError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`Fatal startup error: ${serializeError(error).message}\n`);
  }
  process.exit(1);
}

async function main(): Promise<void> {
  const env: BotEnv = loadEnv();
  const logger = createLogger(env, {
    shard: env.SHARD_IDS.length > 0 ? env.SHARD_IDS.join(",") : "0",
  });
  const shutdown = new ShutdownManager(logger);
  installProcessGuards(logger, shutdown);

  assertPermissionRegistry();
  logger.info(
    {
      version: BOT_VERSION,
      node: process.version,
      shardCount: env.SHARD_COUNT,
      api: `${env.BOT_API_HOST}:${env.BOT_API_PORT}`,
      owners: env.OWNER_IDS.length,
    },
    "starting Nujum bot",
  );

  const client = new NujumClient(env, logger);
  const watcher = new ConfigWatcher({
    logger,
    // DIRECT_URL is required for LISTEN; pooled URLs fall back to polling.
    connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
    guildIds: () => [...client.guilds.cache.keys()],
    invalidate: (guildId) => {
      client.security.invalidate(guildId);
      client.verification.invalidate(guildId);
      client.modules.invalidate(guildId);
    },
  });
  await loadCommands(client);
  await loadEvents(client);
  registerInteractionRoutes(client);

  const api = await createApiServer({
    env,
    logger,
    client,
    services: { actions: client.liveActions, queue: client.queue },
    startedAt: client.startedAt,
    databaseHealthy: createDatabaseHealth(logger),
  });

  // Registered database → client → api; hooks run in reverse (api, client, db).
  shutdown.register("database", () => disconnectPrisma());
  shutdown.register("watcher", () => watcher.stop());
  shutdown.register("gateway", () => client.shutdown("shutdown"));
  shutdown.register("api", () => api.close());

  try {
    await api.listen({ host: env.BOT_API_HOST, port: env.BOT_API_PORT });
    logger.info({ host: env.BOT_API_HOST, port: env.BOT_API_PORT }, "internal API listening");
  } catch (error) {
    logger.fatal({ err: serializeError(error) }, "failed to start internal API");
    await shutdown.shutdown("api-listen-failed", 1);
    return;
  }

  try {
    await watcher.start();
  } catch (error) {
    // The 10-second poll fallback still runs from the watcher itself; a failed
    // LISTEN connection must never prevent the gateway from starting.
    logger.warn({ err: serializeError(error) }, "config listener start failed");
  }

  try {
    await client.login(env.DISCORD_TOKEN);
  } catch (error) {
    logger.fatal({ err: serializeError(error) }, "discord login failed");
    await shutdown.shutdown("login-failed", 1);
  }
}

void main().catch(fatalStartup);
