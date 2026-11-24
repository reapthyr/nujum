import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "discord.js";
import pino from "pino";
import { signRequest } from "@nujum/shared/hmac";
import { createApiServer } from "./server";
import { loadEnv, type BotEnv } from "../config/env";
import type { BotLogger } from "../lib/logger";

const SECRET = "s".repeat(64);

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

function signed(path = "/v1/meta") {
  return signRequest({ secret: SECRET, method: "GET", path, body: "" }).headers;
}

describe("internal API", () => {
  let app: Awaited<ReturnType<typeof createApiServer>>;

  beforeAll(async () => {
    app = await createApiServer({
      env: envWith(),
      logger,
      client,
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

  it("accepts a correctly signed request", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/meta",
      headers: signed(),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { apiVersion: string; guildCount: number } }>();
    expect(body.data.apiVersion).toBe("v1");
    expect(body.data.guildCount).toBe(0);
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
});

describe("IP allowlist", () => {
  it("allows listed CIDRs and blocks everything else", async () => {
    const app = await createApiServer({
      env: envWith({ BOT_API_IP_ALLOWLIST: "10.0.0.0/8" }),
      logger,
      client,
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
