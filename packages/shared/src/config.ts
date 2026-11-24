import { Client as PgClient } from "pg";
import { CONFIG_NOTIFY_CHANNEL } from "./constants";
import type { ConfigNotifyPayload } from "./types/config";
import { configNotifyPayloadSchema } from "./zod/config-bus";

/**
 * Server-only configuration bus shared by both deployables.
 *
 * Writes happen inside the caller's Prisma transaction so the config row,
 * `configVersion` bump, audit entry and `NOTIFY` cannot diverge. The listener is
 * a dedicated `pg` connection because PostgreSQL `LISTEN` cannot run through a
 * transaction pooler.
 */

export interface ConfigChangeInput {
  guildId: string;
  source: ConfigNotifyPayload["source"];
  action?: string;
  changedBy?: string;
}

export interface ConfigListenerLogger {
  debug?(obj: Record<string, unknown>, message: string): void;
  info?(obj: Record<string, unknown>, message: string): void;
  warn?(obj: Record<string, unknown>, message: string): void;
  error?(obj: Record<string, unknown>, message: string): void;
}

export interface ConfigListenerOptions {
  /** Direct (non-pooled) PostgreSQL URL for the long-lived LISTEN connection. */
  connectionString: string;
  onPayload: (payload: ConfigNotifyPayload, raw: string) => void | Promise<void>;
  logger?: ConfigListenerLogger;
  retryDelayMs?: number;
  /** Injectable for tests; ignored in production code. */
  createClient?: (connectionString: string) => ConfigListenerClient;
}

export interface ConfigListenerClient {
  onNotification(listener: (notification: { channel: string; payload?: string }) => void): void;
  onError(listener: (error: Error) => void): void;
  onEnd(listener: () => void): void;
  connect(): Promise<void>;
  query(text: string): Promise<unknown>;
  end(): Promise<void>;
}

export interface ConfigListener {
  readonly connected: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function pgSsl(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    if (mode === "disable" || mode === null) return undefined;
    return { rejectUnauthorized: mode !== "require" };
  } catch {
    return undefined;
  }
}

function pgClient(connectionString: string): ConfigListenerClient {
  const client = new PgClient({
    connectionString,
    ssl: pgSsl(connectionString),
    connectionTimeoutMillis: 5_000,
  });

  return {
    onNotification: (listener) => {
      client.on("notification", listener);
    },
    onError: (listener) => {
      client.on("error", listener);
    },
    onEnd: (listener) => {
      client.on("end", listener);
    },
    connect: async () => {
      await client.connect();
    },
    query: (text) => client.query(text),
    end: () => client.end(),
  };
}

/**
 * Increments `Guild.configVersion` and emits the signal. The caller supplies
 * the transaction client, so all writes remain atomic.
 */
export async function notifyConfigChange(
  tx: {
    guild: {
      update(args: {
        where: { id: string };
        data: { configVersion: { increment: number } };
        select: { configVersion: true };
      }): Promise<{ configVersion: number }>;
    };
    $executeRaw(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<number>;
  },
  change: ConfigChangeInput,
): Promise<number> {
  const updated = await tx.guild.update({
    where: { id: change.guildId },
    data: { configVersion: { increment: 1 } },
    select: { configVersion: true },
  });

  const payload: ConfigNotifyPayload = {
    guildId: change.guildId,
    version: updated.configVersion,
    source: change.source,
    ...(change.action ? { action: change.action } : {}),
    ...(change.changedBy ? { changedBy: change.changedBy } : {}),
    at: new Date().toISOString(),
  };

  await tx.$executeRaw`SELECT pg_notify(${CONFIG_NOTIFY_CHANNEL}, ${JSON.stringify(payload)})`;
  return updated.configVersion;
}

/** Parses an untrusted NOTIFY payload. Invalid signals are ignored by the bot. */
export function parseConfigNotification(raw: string | undefined): ConfigNotifyPayload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = configNotifyPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function createConfigListener(options: ConfigListenerOptions): ConfigListener {
  const logger = options.logger;
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  const create = options.createClient ?? pgClient;
  let client: ConfigListenerClient | null = null;
  let connected = false;
  let stopped = false;
  let retryTimer: NodeJS.Timeout | undefined;
  let connecting: Promise<void> | null = null;

  const scheduleReconnect = (): void => {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, retryDelayMs);
    retryTimer.unref?.();
  };

  async function connect(): Promise<void> {
    if (stopped || connected || connecting) return;
    connecting = (async () => {
      try {
        const next = create(options.connectionString);
        client = next;
        next.onNotification((notification) => {
          if (notification.channel !== CONFIG_NOTIFY_CHANNEL) return;
          const payload = parseConfigNotification(notification.payload);
          if (!payload) {
            logger?.warn?.(
              { channel: notification.channel },
              "invalid config notification ignored",
            );
            return;
          }
          try {
            void Promise.resolve(options.onPayload(payload, notification.payload ?? "")).catch(
              (error: unknown) => {
                logger?.error?.(
                  { err: error, guildId: payload.guildId },
                  "config notification handler failed",
                );
              },
            );
          } catch (error) {
            logger?.error?.(
              { err: error, guildId: payload.guildId },
              "config notification handler threw",
            );
          }
        });
        next.onError((error) => {
          connected = false;
          logger?.warn?.({ err: error }, "config listener connection error");
        });
        next.onEnd(() => {
          connected = false;
          if (client === next) client = null;
          scheduleReconnect();
        });
        await next.connect();
        await next.query(`LISTEN ${CONFIG_NOTIFY_CHANNEL}`);
        connected = true;
        logger?.info?.({ channel: CONFIG_NOTIFY_CHANNEL }, "config listener ready");
      } catch (error) {
        connected = false;
        logger?.warn?.({ err: error }, "config listener unavailable; polling fallback active");
        scheduleReconnect();
      } finally {
        connecting = null;
      }
    })();
    return connecting;
  }

  return {
    get connected() {
      return connected;
    },
    start: connect,
    stop: async () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      const current = client;
      client = null;
      connected = false;
      if (!current) return;
      try {
        await current.end();
      } catch (error) {
        logger?.warn?.({ err: error }, "config listener shutdown failed");
      }
    },
  };
}
