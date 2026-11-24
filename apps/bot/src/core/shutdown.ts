import { serializeError, withTimeout } from "../lib/errors";
import type { BotLogger } from "../lib/logger";

interface ShutdownHook {
  name: string;
  run: () => Promise<void> | void;
  timeoutMs: number;
}

/**
 * Runs shutdown hooks in reverse registration order with a hard deadline, so a
 * hung Discord or database socket cannot keep the container alive.
 */
export class ShutdownManager {
  private readonly hooks: ShutdownHook[] = [];
  private started = false;

  constructor(
    private readonly logger: BotLogger,
    private readonly totalTimeoutMs = 15_000,
  ) {}

  get isShuttingDown(): boolean {
    return this.started;
  }

  register(name: string, run: () => Promise<void> | void, timeoutMs = 5_000): void {
    this.hooks.push({ name, run, timeoutMs });
  }

  async shutdown(reason: string, exitCode = 0): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.logger.info(
      { reason, hooks: this.hooks.map((hook) => hook.name) },
      "graceful shutdown started",
    );

    const watchdog = setTimeout(() => {
      this.logger.fatal({ reason }, "shutdown timed out; forcing exit");
      process.exit(1);
    }, this.totalTimeoutMs);
    watchdog.unref();

    for (const hook of [...this.hooks].reverse()) {
      try {
        await withTimeout(
          Promise.resolve(hook.run()),
          hook.timeoutMs,
          `shutdown hook "${hook.name}" timed out`,
        );
        this.logger.debug({ hook: hook.name }, "shutdown hook complete");
      } catch (error) {
        this.logger.error({ err: serializeError(error), hook: hook.name }, "shutdown hook failed");
      }
    }

    clearTimeout(watchdog);
    this.logger.info({ reason, exitCode }, "graceful shutdown complete");
    process.exit(exitCode);
  }
}
