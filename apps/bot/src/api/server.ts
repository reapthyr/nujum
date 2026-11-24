import Fastify, { LogController, type FastifyError } from "fastify";
import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import type * as z from "zod";
import {
  BOT_API_PREFIX,
  HMAC_CONSTANTS,
  type BotApiErrorBody,
  type BotApiErrorCode,
  type MetaDTO,
  announcementBodySchema,
  guildPathParamsSchema,
  lockdownBodySchema,
  publishTicketPanelBodySchema,
  publishVerificationBodySchema,
  queueDrainBodySchema,
  sendMessageBodySchema,
  snowflakeSchema,
} from "@nujum/shared";
import { NonceCache, verifyRequest } from "@nujum/shared/hmac";
import { BOT_VERSION } from "../config/constants";
import type { BotEnv } from "../config/env";
import { serializeError } from "../lib/errors";
import { isIpAllowed } from "../lib/ip";
import type { BotLogger } from "../lib/logger";
import { ApiActionError, type LiveActions } from "./live-actions";
import { ApiRateLimiter } from "./rate-limit";
import type { QueueService } from "./queue";
import "./types";

export interface ApiServices {
  actions: LiveActions;
  queue: QueueService;
}

export interface ApiDependencies {
  env: BotEnv;
  logger: BotLogger;
  client: Client;
  services: ApiServices;
  databaseHealthy: () => Promise<boolean>;
  startedAt: number;
  version?: string;
}

function errorBody(requestId: string, code: BotApiErrorCode, message: string): BotApiErrorBody {
  return { error: { code, message, requestId } };
}

function parseRequest<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiActionError("BAD_REQUEST", "Invalid request payload.", 400);
  return result.data as z.infer<S>;
}

function actorFrom(request: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = request.headers[HMAC_CONSTANTS.headerActor];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = snowflakeSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiActionError("BAD_REQUEST", "A valid dashboard actor id is required.", 400);
  }
  return parsed.data;
}

/**
 * Internal Bot API.
 *
 * - `/healthz` and `/readyz` are unauthenticated, read-only probes with no secrets.
 * - Everything under `/v1` requires HMAC-SHA256 with a 60s window, a single-use
 *   nonce and an optional IP allowlist.
 * - Live mutations re-check guild, channel and permission state before acting.
 * - No CORS: only the dashboard server talks to this API.
 */
export async function createApiServer(deps: ApiDependencies) {
  const { env, logger, client, services } = deps;
  const version = deps.version ?? BOT_VERSION;
  const nonceCache = new NonceCache();
  const rateLimiter = new ApiRateLimiter();

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: env.BOT_API_TRUST_PROXY,
    bodyLimit: 512 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
  });

  // Capture the exact bytes before JSON parsing so signatures verify byte-for-byte.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    request.rawBody = raw;
    if (raw.trim() === "") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw) as unknown);
    } catch {
      const error = Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
      done(error, undefined);
    }
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "no-store");
    reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    done(null, payload);
  });

  app.addHook("onResponse", (request, reply, done) => {
    logger.debug(
      {
        requestId: request.id,
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "api request",
    );
    done();
  });

  app.get("/healthz", () => ({
    status: "ok",
    version,
    uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
    timestamp: new Date().toISOString(),
  }));

  app.get("/readyz", async (request, reply) => {
    const database = await deps.databaseHealthy();
    const gateway = client.isReady();
    const ok = database && gateway;
    return reply.code(ok ? 200 : 503).send({
      ok,
      database,
      gateway,
      version,
      uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
      requestId: request.id,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiActionError) {
      return reply.code(error.statusCode).send(errorBody(request.id, error.code, error.message));
    }

    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
    logger.error(
      {
        err: serializeError(error),
        requestId: request.id,
        method: request.method,
        path: request.url,
      },
      "api request failed",
    );
    const code: BotApiErrorCode =
      statusCode >= 500 ? "INTERNAL" : statusCode === 404 ? "NOT_FOUND" : "BAD_REQUEST";
    return reply
      .code(statusCode)
      .send(
        errorBody(
          request.id,
          code,
          statusCode >= 500 ? "Internal server error." : "Invalid request.",
        ),
      );
  });

  await app.register(
    (scope) => {
      scope.addHook("preHandler", (request, reply, done) => {
        const ip = request.ip;

        const failureBudget = rateLimiter.check("authFailure", ip);
        if (!failureBudget.allowed) {
          reply
            .header("retry-after", Math.ceil(failureBudget.retryAfterMs / 1000))
            .code(429)
            .send(
              errorBody(request.id, "RATE_LIMITED", "Too many failed authentication attempts."),
            );
          done();
          return;
        }

        if (!isIpAllowed(ip, env.BOT_API_IP_ALLOWLIST)) {
          logger.warn({ requestId: request.id, ip }, "api request from disallowed IP");
          reply.code(403).send(errorBody(request.id, "FORBIDDEN", "IP address is not allowed."));
          done();
          return;
        }

        const verification = verifyRequest({
          secret: env.BOT_API_HMAC_SECRET,
          previousSecret: env.BOT_API_HMAC_SECRET_PREVIOUS,
          headers: request.headers,
          method: request.method,
          path: request.raw.url ?? request.url,
          body: request.rawBody ?? "",
          nonceCache,
          expectedKeyId: HMAC_CONSTANTS.defaultKeyId,
        });

        if (!verification.ok) {
          logger.warn(
            { requestId: request.id, ip, code: verification.code },
            "api signature verification failed",
          );
          reply.code(401).send(errorBody(request.id, "UNAUTHORIZED", "Invalid request signature."));
          done();
          return;
        }

        const authenticatedBudget = rateLimiter.check("authenticated", ip);
        if (!authenticatedBudget.allowed) {
          reply
            .header("retry-after", Math.ceil(authenticatedBudget.retryAfterMs / 1000))
            .code(429)
            .send(errorBody(request.id, "RATE_LIMITED", "Too many requests. Slow down."));
          done();
          return;
        }

        request.log.debug(
          { requestId: request.id, keyId: verification.keyId, ip },
          "api request authenticated",
        );
        done();
      });

      const enforceMutationLimit = (ip: string): void => {
        const budget = rateLimiter.check("mutation", ip);
        if (!budget.allowed) {
          throw new ApiActionError("RATE_LIMITED", "Too many live actions. Slow down.", 429);
        }
      };

      scope.get("/meta", async (request) => {
        const meta: MetaDTO = {
          version,
          apiVersion: "v1",
          shards: client.shard?.count ?? client.options.shardCount ?? 1,
          pingMs: Math.max(0, Math.round(client.ws.ping)),
          uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
          guildCount: client.guilds.cache.size,
          userCount: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
          queueDepth: await services.queue.depth(),
          startedAt: new Date(deps.startedAt).toISOString(),
        };
        return { data: meta, requestId: request.id };
      });

      scope.get("/guilds/:guildId", async (request) => {
        const params = parseRequest(guildPathParamsSchema, request.params);
        const data = await services.actions.snapshot(params.guildId);
        return { data, requestId: request.id };
      });

      scope.post("/guilds/:guildId/messages", async (request) => {
        enforceMutationLimit(request.ip);
        const params = parseRequest(guildPathParamsSchema, request.params);
        const body = parseRequest(sendMessageBodySchema, request.body);
        const data = await services.actions.sendMessage(params.guildId, body, actorFrom(request));
        return { data, requestId: request.id };
      });

      scope.post("/guilds/:guildId/announcements", async (request) => {
        enforceMutationLimit(request.ip);
        const params = parseRequest(guildPathParamsSchema, request.params);
        const body = parseRequest(announcementBodySchema, request.body);
        const data = await services.actions.announcement(params.guildId, body, actorFrom(request));
        return { data, requestId: request.id };
      });

      scope.post("/guilds/:guildId/panels/verification", async (request) => {
        enforceMutationLimit(request.ip);
        const params = parseRequest(guildPathParamsSchema, request.params);
        const body = parseRequest(publishVerificationBodySchema, request.body);
        const data = await services.actions.publishVerificationPanel(
          params.guildId,
          body,
          actorFrom(request),
        );
        return { data, requestId: request.id };
      });

      scope.post("/guilds/:guildId/panels/tickets", async (request) => {
        enforceMutationLimit(request.ip);
        const params = parseRequest(guildPathParamsSchema, request.params);
        const body = parseRequest(publishTicketPanelBodySchema, request.body);
        const data = await services.actions.publishTicketPanel(
          params.guildId,
          { channelId: body.channelId, preview: false },
          actorFrom(request),
        );
        return { data, requestId: request.id };
      });

      scope.post("/guilds/:guildId/lockdown", async (request) => {
        enforceMutationLimit(request.ip);
        const params = parseRequest(guildPathParamsSchema, request.params);
        const body = parseRequest(lockdownBodySchema, request.body);
        const data = await services.actions.setLockdown(params.guildId, body, actorFrom(request));
        return { data, requestId: request.id };
      });

      scope.post("/queue/drain", async (request) => {
        const budget = rateLimiter.check("queueDrain", request.ip);
        if (!budget.allowed) {
          throw new ApiActionError("RATE_LIMITED", "Queue drain is rate limited.", 429);
        }
        actorFrom(request);
        const body = parseRequest(queueDrainBodySchema, request.body);
        const data = await services.queue.drain(body.limit);
        return { data, requestId: request.id };
      });
    },
    { prefix: BOT_API_PREFIX },
  );

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody(request.id, "NOT_FOUND", "Route not found.")),
  );

  return app;
}
