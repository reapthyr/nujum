import { getPrisma } from "@nujum/shared/prisma";
import { serializeError, withTimeout } from "./errors";
import type { BotLogger } from "./logger";

/**
 * Lazy database probe used by `/readyz`. The bot boots even when the database
 * is down; the dashboard keeps working because config lives in Postgres, and
 * readiness reports the dependency state instead of crash-looping.
 */
export function createDatabaseHealth(logger: BotLogger): () => Promise<boolean> {
  let lastState: boolean | null = null;

  return async () => {
    try {
      await withTimeout(getPrisma().$queryRaw`SELECT 1`, 2_500, "database health check timed out");
      if (lastState !== true) logger.info("database reachable");
      lastState = true;
      return true;
    } catch (error) {
      if (lastState !== false) {
        logger.warn({ err: serializeError(error) }, "database unreachable");
      }
      lastState = false;
      return false;
    }
  };
}
