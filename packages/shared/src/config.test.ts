import { describe, expect, it, vi } from "vitest";
import {
  createConfigListener,
  notifyConfigChange,
  parseConfigNotification,
  type ConfigListenerClient,
} from "./config";
import { CONFIG_NOTIFY_CHANNEL } from "./constants";

const GUILD_ID = "123456789012345678";

describe("config notification payload", () => {
  it("parses valid signals and rejects untrusted payloads", () => {
    const valid = JSON.stringify({
      guildId: GUILD_ID,
      version: 7,
      source: "DASHBOARD",
      action: "security.update",
      changedBy: "987654321098765432",
      at: new Date().toISOString(),
    });
    expect(parseConfigNotification(valid)?.version).toBe(7);
    expect(parseConfigNotification("not json")).toBeNull();
    expect(
      parseConfigNotification(JSON.stringify({ guildId: GUILD_ID, version: 0, source: "HACKER" })),
    ).toBeNull();
    expect(parseConfigNotification(undefined)).toBeNull();
  });
});

describe("notifyConfigChange", () => {
  it("increments the version and emits the channel through bound parameters", async () => {
    const queries: Array<{ strings: readonly string[]; values: readonly unknown[] }> = [];
    const update = vi.fn().mockResolvedValue({ configVersion: 12 });
    const executeRaw = (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> => {
      queries.push({ strings, values });
      return Promise.resolve(1);
    };

    const version = await notifyConfigChange(
      {
        guild: { update },
        $executeRaw: executeRaw,
      },
      { guildId: GUILD_ID, source: "BOT", action: "security.toggle" },
    );

    expect(version).toBe(12);
    expect(update).toHaveBeenCalledWith({
      where: { id: GUILD_ID },
      data: { configVersion: { increment: 1 } },
      select: { configVersion: true },
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.strings.join("")).toContain("pg_notify");
    expect(queries[0]?.values[0]).toBe(CONFIG_NOTIFY_CHANNEL);
    expect(parseConfigNotification(String(queries[0]?.values[1]))?.version).toBe(12);
  });
});

describe("config listener", () => {
  function fakeClient() {
    let notification: ((value: { channel: string; payload?: string }) => void) | undefined;
    let failure: ((error: Error) => void) | undefined;
    let ended: (() => void) | undefined;
    const client: ConfigListenerClient = {
      onNotification: (listener) => {
        notification = listener;
      },
      onError: (listener) => {
        failure = listener;
      },
      onEnd: (listener) => {
        ended = listener;
      },
      connect: () => Promise.resolve(),
      query: () => Promise.resolve(),
      end: () => Promise.resolve(),
    };
    return {
      client,
      emit: (payload: string, channel = CONFIG_NOTIFY_CHANNEL) =>
        notification?.({ channel, payload }),
      fail: () => failure?.(new Error("connection lost")),
      end: () => ended?.(),
    };
  }

  it("delivers only valid payloads on the configured channel", async () => {
    const f = fakeClient();
    const payloads: string[] = [];
    const listener = createConfigListener({
      connectionString: "postgresql://localhost/nujum",
      createClient: () => f.client,
      onPayload: (payload) => {
        payloads.push(payload.action ?? "");
      },
    });
    await listener.start();
    expect(listener.connected).toBe(true);

    const signal = JSON.stringify({
      guildId: GUILD_ID,
      version: 3,
      source: "DASHBOARD",
      action: "security.update",
      at: new Date().toISOString(),
    });
    f.emit(signal);
    f.emit(JSON.stringify({ guildId: GUILD_ID, version: 1, source: "NOPE" }));
    f.emit(signal, "other");
    await Promise.resolve();
    expect(payloads).toEqual(["security.update"]);
    await listener.stop();
  });

  it("reconnects after a dropped connection unless stopped", async () => {
    const first = fakeClient();
    const second = fakeClient();
    const created: ConfigListenerClient[] = [];
    const listener = createConfigListener({
      connectionString: "postgresql://localhost/nujum",
      retryDelayMs: 1,
      createClient: () => {
        const next = created.length === 0 ? first.client : second.client;
        created.push(next);
        return next;
      },
      onPayload: () => undefined,
    });
    await listener.start();
    first.end();
    await vi.waitFor(() => expect(created).toHaveLength(2), { timeout: 100 });
    await listener.stop();
  });
});
