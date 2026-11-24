import "dotenv/config";
import { join } from "node:path";
import { EnvValidationError } from "@nujum/shared/env";
import type { Command } from "../commands/types";
import { loadEnv } from "../config/env";
import { deployCommands } from "../lib/deploy-commands";
import { serializeError } from "../lib/errors";
import { loadDirectoryModules } from "../lib/loader";
import { createLogger } from "../lib/logger";

/**
 * Registers slash commands without starting the gateway.
 *
 * - With DEV_GUILD_ID: instant, guild-scoped (development).
 * - Without it: global registration (up to one hour to propagate).
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env, { role: "deploy-commands" });
  const commands = await loadDirectoryModules<Command>(
    join(__dirname, "..", "commands"),
    "command",
  );
  const guildId = env.DEV_GUILD_ID ?? null;

  const count = await deployCommands({
    token: env.DISCORD_TOKEN,
    applicationId: env.DISCORD_CLIENT_ID,
    guildId,
    commands,
    logger,
  });

  logger.info(
    { count, scope: guildId ? "guild" : "global", guildId },
    "command deployment finished",
  );
}

void main().catch((error: unknown) => {
  if (error instanceof EnvValidationError) process.stderr.write(`${error.message}\n`);
  else process.stderr.write(`Command deployment failed: ${serializeError(error).message}\n`);
  process.exit(1);
});
