import {
  HMAC_CONSTANTS,
  botActionResultSchema,
  botApiErrorResponseSchema,
  botApiSuccessResponseSchema,
  botGuildSnapshotSchema,
  botMetaSchema,
  queueDrainResultSchema,
  type AnnouncementInput,
  type BotActionResult,
  type BotGuildSnapshot,
  type BotMeta,
  type LockdownInput,
  type PublishVerificationInput,
  type QueueDrainResult,
  type SendMessageInput,
} from "@nujum/shared";
import { signRequest } from "@nujum/shared/hmac";
import { z } from "zod";
import { getEnv } from "../env";
import type { BotResponse } from "./live-types";

type ResponseParser<T> = {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
};

interface BotClientOptions {
  baseUrl: string;
  secret: string;
  previousSecret?: string;
  actorId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Server-only HMAC client. Secrets and OAuth tokens never reach a component. */
export class BotApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: BotClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 6_000;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    parser: ResponseParser<T>,
    body?: unknown,
  ): Promise<BotResponse<T>> {
    if (!path.startsWith("/")) return this.fail("Invalid Bot API path.", "BAD_REQUEST");
    const payload = body === undefined ? "" : JSON.stringify(body);
    const url = new URL(path, this.options.baseUrl);
    const signedPath = url.pathname + url.search;
    const signed = signRequest({
      secret: this.options.secret,
      method,
      path: signedPath,
      body: payload,
    });

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          ...signed.headers,
          ...(payload ? { "content-type": "application/json" } : {}),
          [HMAC_CONSTANTS.headerActor]: this.options.actorId,
          accept: "application/json",
        },
        ...(payload ? { body: payload } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const raw: unknown = await response.json().catch(() => null);
      const envelope = botApiSuccessResponseSchema.safeParse(raw);
      if (response.ok && envelope.success) {
        const parsed = parser.safeParse(envelope.data.data);
        if (!parsed.success) {
          return this.fail(
            "The bot returned an unexpected response.",
            "BAD_RESPONSE",
            response.status,
          );
        }
        return {
          ok: true,
          data: parsed.data,
          offline: false,
          requestId: envelope.data.requestId,
        };
      }

      const errorEnvelope = botApiErrorResponseSchema.safeParse(raw);
      const code = errorEnvelope.success ? errorEnvelope.data.error.code : "UNKNOWN";
      const message = errorEnvelope.success
        ? errorEnvelope.data.error.message
        : "The bot rejected the request.";
      return {
        ok: false,
        error: message,
        code,
        status: response.status,
        offline: response.status >= 500,
        requestId: errorEnvelope.success ? errorEnvelope.data.error.requestId : undefined,
      };
    } catch {
      return {
        ok: false,
        error: "The bot is offline. This action can be queued safely.",
        code: "OFFLINE",
        offline: true,
      };
    }
  }

  private fail<T>(error: string, code: string, status?: number): BotResponse<T> {
    return { ok: false, error, code, status, offline: false };
  }

  getMeta(): Promise<BotResponse<BotMeta>> {
    return this.request("GET", "/v1/meta", botMetaSchema);
  }

  getSnapshot(guildId: string): Promise<BotResponse<BotGuildSnapshot>> {
    return this.request("GET", `/v1/guilds/${guildId}`, botGuildSnapshotSchema);
  }

  sendMessage(guildId: string, input: SendMessageInput): Promise<BotResponse<BotActionResult>> {
    return this.request("POST", `/v1/guilds/${guildId}/messages`, botActionResultSchema, input);
  }

  sendAnnouncement(
    guildId: string,
    input: AnnouncementInput,
  ): Promise<BotResponse<BotActionResult>> {
    return this.request(
      "POST",
      `/v1/guilds/${guildId}/announcements`,
      botActionResultSchema,
      input,
    );
  }

  publishVerificationPanel(
    guildId: string,
    input: PublishVerificationInput,
  ): Promise<BotResponse<BotActionResult>> {
    return this.request(
      "POST",
      `/v1/guilds/${guildId}/panels/verification`,
      botActionResultSchema,
      input,
    );
  }

  setLockdown(guildId: string, input: LockdownInput): Promise<BotResponse<BotActionResult>> {
    return this.request("POST", `/v1/guilds/${guildId}/lockdown`, botActionResultSchema, input);
  }

  drainQueue(limit = 25): Promise<BotResponse<QueueDrainResult>> {
    return this.request("POST", "/v1/queue/drain", queueDrainResultSchema, { limit });
  }
}

export function createBotClient(actorId: string): BotApiClient {
  const env = getEnv();
  return new BotApiClient({
    baseUrl: env.BOT_API_URL,
    secret: env.BOT_API_HMAC_SECRET,
    ...(env.BOT_API_HMAC_SECRET_PREVIOUS
      ? { previousSecret: env.BOT_API_HMAC_SECRET_PREVIOUS }
      : {}),
    actorId,
  });
}

export function isSnowflake(value: string): boolean {
  return z
    .string()
    .regex(/^\d{16,20}$/)
    .safeParse(value).success;
}
