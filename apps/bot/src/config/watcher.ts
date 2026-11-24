import {
  CONFIG_NOTIFY_CHANNEL,
  CONFIG_POLL_INTERVAL_MS,
  type ConfigNotifyPayload,
} from "@nujum/shared";
import { createConfigListener, type ConfigListener } from "@nujum/shared/config";
import { getPrisma } from "@nujum/shared/prisma";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";

export interface ConfigVersionReader {
  read(guildIds: readonly string[]): Promise<Map<string, number>>;
}

/** Poll fallback; only versions are read, never the config values themselves. */
export class PrismaConfigVersionReader implements ConfigVersionReader {
  async read(guildIds: readonly string[]): Promise<Map<string, number>> {
    if (guildIds.length === 0) return new Map();
    const rows = await getPrisma().guild.findMany({
      where: { id: { in: [...guildIds] } },
      select: { id: true, configVersion: true },
    });
    return new Map(rows.map((row) => [row.id, row.configVersion]));
  }
}

export interface ConfigWatcherOptions {
  logger: BotLogger;
  /** All caches a config change can affect. */
  invalidate: (guildId?: string) => void;
  guildIds: () => string[];
  connectionString: string;
  reader?: ConfigVersionReader;
  listenerFactory?: (onPayload: (payload: ConfigNotifyPayload) => void) => ConfigListener;
  pollIntervalMs?: number;
}

/**
 * Keeps per-guild caches fresh without restarting the bot.
 *
 * `NOTIFY` is the fast path; a 10-second version poll covers dropped signals,
 * pooled connections that cannot LISTEN, and multi-instance deployments. Every
 * signal is validated and compared by version before a cache is invalidated.
 */
export class ConfigWatcher {
  private readonly versions = new Map<string, number>();
  private readonly reader: ConfigVersionReader;
  private readonly listener: ConfigListener;
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private polling = false;

  constructor(private readonly options: ConfigWatcherOptions) {
    this.reader = options.reader ?? new PrismaConfigVersionReader();
    this.pollIntervalMs = options.pollIntervalMs ?? CONFIG_POLL_INTERVAL_MS;
    this.listener =
      options.listenerFactory?.(this.onNotification.bind(this)) ??
      createConfigListener({
        connectionString: options.connectionString,
        logger: options.logger,
        onPayload: this.onNotification.bind(this),
      });
  }

  get connected(): boolean {
    return this.listener.connected;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.poll();
    await this.listener.start();
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    this.timer.unref?.();
    this.options.logger.info(
      { channel: CONFIG_NOTIFY_CHANNEL, pollIntervalMs: this.pollIntervalMs },
      "config watcher started",
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.listener.stop();
  }

  /** Exposed for tests and for a manual refresh from the bot API. */
  onNotification(payload: ConfigNotifyPayload): void {
    const known = this.versions.get(payload.guildId);
    if (known !== undefined && payload.version <= known) return;
    this.versions.set(payload.guildId, payload.version);
    this.options.invalidate(payload.guildId);
    this.options.logger.debug(
      { guildId: payload.guildId, version: payload.version, source: payload.source },
      "config notification applied",
    );
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const ids = this.options.guildIds();
      const latest = await this.reader.read(ids);
      const current = new Set(ids);

      for (const [guildId, version] of latest) {
        const known = this.versions.get(guildId);
        if (known === undefined || version > known) {
          this.options.invalidate(guildId);
          this.options.logger.debug(
            { guildId, version, previous: known ?? null },
            "config version changed",
          );
        }
        this.versions.set(guildId, version);
      }

      for (const guildId of this.versions.keys()) {
        if (!current.has(guildId)) this.versions.delete(guildId);
      }
    } catch (error) {
      this.options.logger.warn({ err: serializeError(error) }, "config version poll failed");
    } finally {
      this.polling = false;
    }
  }
}
