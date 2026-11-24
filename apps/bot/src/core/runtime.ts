import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";
import type { ShutdownManager } from "./shutdown";

/**
 * Last line of defence. Every command/event/API handler catches its own errors;
 * these handlers exist so a missed promise or a library bug is logged and, for
 * an uncaught exception, followed by a clean restart.
 */
export function installProcessGuards(logger: BotLogger, shutdown: ShutdownManager): void {
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: serializeError(reason) }, "unhandled promise rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: serializeError(error) }, "uncaught exception");
    void shutdown.shutdown("uncaughtException", 1);
  });

  process.on("warning", (warning) => {
    logger.warn({ name: warning.name, message: warning.message }, "process warning");
  });

  process.on("SIGINT", () => {
    void shutdown.shutdown("SIGINT", 0);
  });

  process.on("SIGTERM", () => {
    void shutdown.shutdown("SIGTERM", 0);
  });
}
