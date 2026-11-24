import "dotenv/config";
import { join } from "node:path";
import { ShardingManager } from "discord.js";
import { EnvValidationError } from "@nujum/shared/env";
import { loadEnv } from "./config/env";
import { serializeError } from "./lib/errors";
import { createLogger } from "./lib/logger";

/**
 * Sharding entry point. Each shard is a separate `dist/index.js` process; no
 * in-memory state is shared between them.
 *
 * Usage: `pnpm build && node dist/shard.js` (SHARD_COUNT controls the amount).
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env, { role: "sharding-manager" });
  const shardFile = join(__dirname, "index.js");

  const manager = new ShardingManager(shardFile, {
    token: env.DISCORD_TOKEN,
    totalShards: env.SHARD_COUNT,
    respawn: true,
    execArgv: ["--enable-source-maps"],
  });

  manager.on("shardCreate", (shard) => {
    logger.info({ shardId: shard.id }, "spawning shard");
    shard.on("ready", () => logger.info({ shardId: shard.id }, "shard ready"));
    shard.on("reconnecting", () => logger.warn({ shardId: shard.id }, "shard reconnecting"));
    shard.on("death", (child) => {
      const pid = "pid" in child ? child.pid : undefined;
      logger.error({ shardId: shard.id, pid }, "shard process died; respawning");
    });
    shard.on("error", (error) => {
      logger.error({ err: serializeError(error), shardId: shard.id }, "shard error");
    });
  });

  const stop = (signal: string): void => {
    logger.info({ signal }, "stopping sharding manager");
    try {
      for (const shard of manager.shards.values()) shard.kill();
    } catch (error) {
      logger.error({ err: serializeError(error) }, "failed to kill shards");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  await manager.spawn({ amount: env.SHARD_COUNT, delay: 5_500, timeout: 60_000 });
  logger.info({ shards: manager.shards.size }, "all shards spawned");
}

void main().catch((error: unknown) => {
  if (error instanceof EnvValidationError) process.stderr.write(`${error.message}\n`);
  else process.stderr.write(`Fatal sharding error: ${serializeError(error).message}\n`);
  process.exit(1);
});
