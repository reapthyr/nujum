import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { ConfigNotifyPayload } from "@nujum/shared";
import type { ConfigListener } from "@nujum/shared/config";
import type { BotLogger } from "../lib/logger";
import { ConfigWatcher, type ConfigVersionReader } from "./watcher";

const logger = pino({ level: "silent" }) as unknown as BotLogger;
const GUILD = "123456789012345678";
const OTHER = "987654321098765432";

function payload(version: number): ConfigNotifyPayload {
  return {
    guildId: GUILD,
    version,
    source: "DASHBOARD",
    action: "security.update",
    at: new Date().toISOString(),
  };
}

type TriggerListener = ConfigListener & { trigger: (payload: ConfigNotifyPayload) => void };

function listener(onPayload: (payload: ConfigNotifyPayload) => void): TriggerListener {
  const fake: TriggerListener = {
    connected: true,
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    trigger: onPayload,
  };
  return fake;
}

function setup(reader: ConfigVersionReader) {
  const invalidated: Array<string | undefined> = [];
  const watcher = new ConfigWatcher({
    logger,
    invalidate: (guildId) => invalidated.push(guildId),
    guildIds: () => [GUILD, OTHER],
    connectionString: "postgresql://localhost/nujum",
    reader,
    listenerFactory: (onPayload) => {
      const fake = listener(onPayload);
      fake.trigger(payload(99));
      return fake;
    },
  });
  return { watcher, invalidated };
}

describe("config watcher", () => {
  it("ignores stale notifications and applies newer versions once", async () => {
    const read = vi.fn().mockResolvedValue(new Map([[GUILD, 3]]));
    const { watcher, invalidated } = setup({ read });
    await watcher.poll();
    invalidated.length = 0;

    watcher.onNotification(payload(3));
    watcher.onNotification(payload(2));
    expect(invalidated).toEqual([]);

    watcher.onNotification(payload(4));
    watcher.onNotification(payload(4));
    expect(invalidated).toEqual([GUILD]);
  });

  it("detects version changes in the poll fallback and clears stale guilds", async () => {
    const versions = new Map<string, number>([
      [GUILD, 1],
      [OTHER, 2],
    ]);
    const read = vi.fn().mockImplementation(() => Promise.resolve(new Map(versions)));
    const { watcher, invalidated } = setup({ read });
    await watcher.poll();
    expect(invalidated).toEqual([GUILD, OTHER]);

    invalidated.length = 0;
    versions.set(GUILD, 2);
    versions.delete(OTHER);
    await watcher.poll();
    expect(invalidated).toEqual([GUILD]);
  });

  it("swallows database failures so gateway events keep running", async () => {
    const { watcher, invalidated } = setup({
      read: () => Promise.reject(new Error("database down")),
    });
    invalidated.length = 0;
    await expect(watcher.poll()).resolves.toBeUndefined();
    expect(invalidated).toEqual([]);
  });
});
