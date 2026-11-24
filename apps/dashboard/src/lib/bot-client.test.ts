import { describe, expect, it, vi } from "vitest";
import { botMetaSchema } from "@nujum/shared";
import { verifyRequest } from "@nujum/shared/hmac";
import { BotApiClient } from "./bot-client";

const SECRET = "s".repeat(64);
const META = {
  version: "0.4.0",
  apiVersion: "v1",
  shards: 1,
  pingMs: 12,
  uptimeSeconds: 42,
  guildCount: 3,
  userCount: 900,
  queueDepth: 2,
  startedAt: new Date().toISOString(),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.toString() : input.url;
}

function client(impl: typeof fetch): BotApiClient {
  return new BotApiClient({
    baseUrl: "https://api.example.com",
    secret: SECRET,
    actorId: "987654321098765432",
    fetch: impl,
  });
}

describe("Bot API client", () => {
  it("signs the exact request path and body with HMAC headers", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: requestUrl(input), init: init ?? {} };
      return Promise.resolve(jsonResponse({ data: META, requestId: "req-1" }));
    }) as unknown as typeof fetch;

    const result = await client(fetchImpl).getMeta();
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(botMetaSchema.parse(META));
    expect(captured).toBeDefined();
    const url = new URL(captured?.url ?? "");
    const headers = captured?.init.headers as Record<string, string>;
    const verification = verifyRequest({
      secret: SECRET,
      headers,
      method: "GET",
      path: url.pathname + url.search,
      body: "",
    });
    expect(verification.ok).toBe(true);
    expect(headers["x-nujum-actor"]).toBe("987654321098765432");
  });

  it("signs POST bodies byte-for-byte", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return Promise.resolve(
        jsonResponse({
          data: { type: "SEND_MESSAGE", status: "SENT", messageId: "111111111111111111" },
          requestId: "req-2",
        }),
      );
    }) as unknown as typeof fetch;

    const result = await client(fetchImpl).sendMessage("123456789012345678", {
      channelId: "222222222222222222",
      content: "hello",
    });
    expect(result.ok).toBe(true);
    const body = (captured?.body as string | undefined) ?? "";
    const headers = captured?.headers as Record<string, string>;
    const verification = verifyRequest({
      secret: SECRET,
      headers,
      method: "POST",
      path: "/v1/guilds/123456789012345678/messages",
      body,
    });
    expect(verification.ok).toBe(true);
  });

  it("signs the ticket panel POST path and body byte-for-byte", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: requestUrl(input), init: init ?? {} };
      return Promise.resolve(
        jsonResponse({
          data: { type: "PUBLISH_TICKET_PANEL", status: "SENT", messageId: "333333333333333333" },
          requestId: "req-ticket",
        }),
      );
    }) as unknown as typeof fetch;

    const result = await client(fetchImpl).publishTicketPanel("123456789012345678", {
      channelId: "222222222222222222",
      preview: true,
    });
    expect(result.ok).toBe(true);
    expect(result.data?.messageId).toBe("333333333333333333");
    const url = new URL(captured?.url ?? "");
    expect(url.pathname).toBe("/v1/guilds/123456789012345678/panels/tickets");
    const body = (captured?.init.body as string | undefined) ?? "";
    const headers = captured?.init.headers as Record<string, string>;
    const verification = verifyRequest({
      secret: SECRET,
      headers,
      method: "POST",
      path: url.pathname + url.search,
      body,
    });
    expect(verification.ok).toBe(true);
    expect(JSON.parse(body)).toEqual({ channelId: "222222222222222222", preview: true });
  });

  it("reports the ticket panel action as safely queueable when the bot is offline", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;
    const result = await client(fetchImpl).publishTicketPanel("123456789012345678", {
      preview: false,
    });
    expect(result.ok).toBe(false);
    expect(result.offline).toBe(true);
    expect(result.code).toBe("OFFLINE");
  });

  it("returns an offline result when the bot cannot be reached", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;
    const result = await client(fetchImpl).getMeta();
    expect(result.ok).toBe(false);
    expect(result.offline).toBe(true);
    expect(result.code).toBe("OFFLINE");
    expect(result.error).not.toContain("ECONNREFUSED");
  });

  it("rejects malformed bot responses without throwing", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ data: { version: 1 }, requestId: "req-3" })),
    ) as unknown as typeof fetch;
    const result = await client(fetchImpl).getMeta();
    expect(result.ok).toBe(false);
    expect(result.code).toBe("BAD_RESPONSE");
    expect(result.offline).toBe(false);
  });

  it("parses structured bot errors", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          { error: { code: "FORBIDDEN", message: "Cannot write there.", requestId: "req-4" } },
          403,
        ),
      ),
    ) as unknown as typeof fetch;
    const result = await client(fetchImpl).getMeta();
    expect(result.ok).toBe(false);
    expect(result.code).toBe("FORBIDDEN");
    expect(result.status).toBe(403);
    expect(result.offline).toBe(false);
  });
});
