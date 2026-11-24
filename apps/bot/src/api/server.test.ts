import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "discord.js";
import pino from "pino";
import { signRequest } from "@nujum/shared/hmac";
import type { BotActionResult, BotGuildSnapshot } from "@nujum/shared";
import { createApiServer, type ApiServices } from "./server";
import type { LiveActions } from "./live-actions";
import type { QueueService } from "./queue";
import { loadEnv, type BotEnv } from "../config/env";
import type { BotLogger } from "../lib/logger";

const SECRET = "s".repeat(64);
const GUILD = "123456789012345678";
const ACTOR = "987654321098765432";

function envWith(overrides: Record<string, string> = {}): BotEnv {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    LOG_PRETTY: "false",
    DISCORD_TOKEN: "t".repeat(60),
    DISCORD_CLIENT_ID: "123456789012345678",
    DATABASE_URL: "postgresql://nujum:secret@localhost:5432/nujum?schema=public",
    BOT_API_HMAC_SECRET: SECRET,
    ...overrides,
  });
}

const logger = pino({ level: "silent" }) as unknown as BotLogger;
const client = new Client({ intents: [] });

const snapshot: BotGuildSnapshot = {
  online: true,
  guild: {
    id: GUILD,
    name: "Test Guild",
    memberCount: 42,
    iconUrl: null,
    ownerId: ACTOR,
    botPermissions: ["SendMessages"],
  },
  channels: [{ id: "111111111111111111", name: "general", type: "text", parentId: null }],
  roles: [{ id: "222222222222222222", name: "Member", color: 0, position: 1 }],
};

type TestServices = ApiServices & {
  sendMessage: ReturnType<typeof vi.fn>;
  publishTicketPanel: ReturnType<typeof vi.fn>;
  drain: ReturnType<typeof vi.fn>;
};

function services(): TestServices {
  const result: BotActionResult = {
    type: "SEND_MESSAGE",
    status: "SENT",
    messageId: "333333333333333333",
  };
  const sendMessage = vi.fn(() => Promise.resolve(result));
  const publishTicketPanel = vi.fn(() =>
    Promise.resolve({ ...result, type: "PUBLISH_TICKET_PANEL" as const }),
  );
  const drain = vi.fn(() => Promise.resolve({ claimed: 1, sent: 1, failed: 0, skipped: 0 }));
  const actions: LiveActions = {
    snapshot: vi.fn(() => Promise.resolve(snapshot)),
    sendMessage,
    announcement: vi.fn(() => Promise.resolve({ ...result, type: "ANNOUNCEMENT" as const })),
    publishVerificationPanel: vi.fn(() =>
      Promise.resolve({ ...result, type: "PUBLISH_VERIFICATION_PANEL" as const }),
    ),
    publishTicketPanel,
    setLockdown: vi.fn(() => Promise.resolve({ ...result, type: "SET_LOCKDOWN" as const })),
  };
  const queue: QueueService = {
    depth: vi.fn(() => Promise.resolve(3)),
    drain,
  };
  return { actions, queue, sendMessage, publishTicketPanel, drain };
}

function signed(path = "/v1/meta") {
  return signRequest({ secret: SECRET, method: "GET", path, body: "" }).headers;
}

function signedPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  return {
    ...signRequest({ secret: SECRET, method: "POST", path, body: payload }).headers,
    "content-type": "application/json",
    "x-nujum-actor": ACTOR,
    ...headers,
  };
}

describe("internal API", () => {
  let app: Awaited<ReturnType<typeof createApiServer>>;
  let depsServices: TestServices;

  beforeAll(async () => {
    depsServices = services();
    app = await createApiServer({
      env: envWith(),
      logger,
      client,
      services: depsServices,
      databaseHealthy: () => Promise.resolve(false),
      startedAt: Date.now() - 5_000,
      version: "0.2.0-test",
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await client.destroy();
  });

  it("serves an unauthenticated liveness probe without secrets", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; version: string }>();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.2.0-test");
    expect(response.body).not.toContain(SECRET);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("reports not ready when the gateway or database is down", async () => {
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(503);
    const body = response.json<{ ok: boolean; database: boolean; gateway: boolean }>();
    expect(body.ok).toBe(false);
    expect(body.database).toBe(false);
    expect(body.gateway).toBe(false);
  });

  it("reports ready when both dependencies are healthy", async () => {
    const ready = vi.spyOn(client, "isReady").mockReturnValue(true);
    const healthyApp = await createApiServer({
      env: envWith(),
      logger,
      client,
      services: services(),
      databaseHealthy: () => Promise.resolve(true),
      startedAt: Date.now(),
    });
    await healthyApp.ready();
    try {
      const response = await healthyApp.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ ok: boolean }>().ok).toBe(true);
    } finally {
      await healthyApp.close();
      ready.mockRestore();
    }
  });

  it("rejects unsigned requests with a structured error", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/meta" });
    expect(response.statusCode).toBe(401);
    const body = response.json<{ error: { code: string; message: string; requestId: string } }>();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.requestId).toBeTruthy();
    expect(body.error.message).not.toMatch(/stack|at Object/i);
  });

  it("accepts a correctly signed request with a real queue depth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/meta",
      headers: signed(),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      data: { apiVersion: string; guildCount: number; queueDepth: number };
    }>();
    expect(body.data.apiVersion).toBe("v1");
    expect(body.data.guildCount).toBe(0);
    expect(body.data.queueDepth).toBe(3);
  });

  it("rejects a replayed nonce", async () => {
    const headers = signed();
    const first = await app.inject({ method: "GET", url: "/v1/meta", headers });
    const second = await app.inject({ method: "GET", url: "/v1/meta", headers });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
  });

  it("rejects a signature for a different path", async () => {
    const headers = signed("/v1/other");
    const response = await app.inject({ method: "GET", url: "/v1/meta", headers });
    expect(response.statusCode).toBe(401);
  });

  it("rejects malformed JSON before routing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/meta",
      headers: { "content-type": "application/json" },
      payload: "{not-json",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("BAD_REQUEST");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("NOT_FOUND");
  });

  it("returns a validated guild snapshot", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/guilds/${GUILD}`,
      headers: signed(`/v1/guilds/${GUILD}`),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: BotGuildSnapshot }>().data.guild.name).toBe("Test Guild");
  });

  it("sends a validated live message with the dashboard actor", async () => {
    const path = `/v1/guilds/${GUILD}/messages`;
    const body = { channelId: "111111111111111111", content: "hello" };
    const response = await app.inject({
      method: "POST",
      url: path,
      headers: signedPost(path, body),
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: BotActionResult }>().data.status).toBe("SENT");
    expect(depsServices.sendMessage).toHaveBeenCalledWith(
      GUILD,
      expect.objectContaining({ content: "hello" }),
      ACTOR,
    );
  });

  it("publishes a ticket panel and forces non-preview API behaviour", async () => {
    const path = `/v1/guilds/${GUILD}/panels/tickets`;
    const body = { channelId: "111111111111111111", preview: true };
    const response = await app.inject({
      method: "POST",
      url: path,
      headers: signedPost(path, body),
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: BotActionResult }>().data.type).toBe("PUBLISH_TICKET_PANEL");
    expect(depsServices.publishTicketPanel).toHaveBeenCalledWith(
      GUILD,
      { channelId: "111111111111111111", preview: false },
      ACTOR,
    );
  });

  it("rejects live mutations without a dashboard actor", async () => {
    const path = `/v1/guilds/${GUILD}/messages`;
    const body = { channelId: "111111111111111111", content: "hello" };
    const headers = signedPost(path, body, { "x-nujum-actor": "not-a-snowflake" });
    const response = await app.inject({ method: "POST", url: path, headers, payload: body });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: expect.objectContaining({ code: "BAD_REQUEST" }) });
  });

  it("rejects live actions that fail zod validation", async () => {
    const path = `/v1/guilds/${GUILD}/lockdown`;
    const body = { active: "yes" };
    const response = await app.inject({
      method: "POST",
      url: path,
      headers: signedPost(path, body),
      payload: body,
    });
    expect(response.statusCode).toBe(400);
  });

  it("drains the offline queue through a signed endpoint", async () => {
    // A fresh server gives this test its own rate-limit buckets; the shared
    // `app` has already spent its auth-failure budget on negative-path tests.
    const drainApp = await createApiServer({
      env: envWith(),
      logger,
      client,
      services: depsServices,
      databaseHealthy: () => Promise.resolve(false),
      startedAt: Date.now(),
      version: "0.2.0-test",
    });
    await drainApp.ready();
    try {
      const path = "/v1/queue/drain";
      const response = await drainApp.inject({
        method: "POST",
        url: path,
        headers: signedPost(path, { limit: 5 }),
        payload: { limit: 5 },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ data: { sent: number } }>().data.sent).toBe(1);
      expect(depsServices.drain).toHaveBeenCalledWith(5);
    } finally {
      await drainApp.close();
    }
  });
});

describe("IP allowlist", () => {
  it("allows listed CIDRs and blocks everything else", async () => {
    const app = await createApiServer({
      env: envWith({ BOT_API_IP_ALLOWLIST: "10.0.0.0/8" }),
      logger,
      client,
      services: services(),
      databaseHealthy: () => Promise.resolve(true),
      startedAt: Date.now(),
    });
    await app.ready();
    try {
      const allowed = await app.inject({
        method: "GET",
        url: "/v1/meta",
        headers: signed(),
        remoteAddress: "10.1.2.3",
      });
      expect(allowed.statusCode).toBe(200);

      const blocked = await app.inject({
        method: "GET",
        url: "/v1/meta",
        headers: signed(),
        remoteAddress: "203.0.113.5",
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json<{ error: { code: string } }>().error.code).toBe("FORBIDDEN");
    } finally {
      await app.close();
    }
  });
});
