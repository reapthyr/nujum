import Fastify, { LogController, type FastifyError } from "fastify";
import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import {
  BOT_API_PREFIX,
  HMAC_CONSTANTS,
  type BotApiErrorBody,
  type BotApiErrorCode,
  type MetaDTO,
} from "@nujum/shared";
import { NonceCache, verifyRequest } from "@nujum/shared/hmac";
import { BOT_VERSION } from "../config/constants";
import type { BotEnv } from "../config/env";
import { serializeError } from "../lib/errors";
import { isIpAllowed } from "../lib/ip";
import type { BotLogger } from "../lib/logger";
import { ApiRateLimiter } from "./rate-limit";
import "./types";

export interface ApiDependencies {
  env: BotEnv;
  logger: BotLogger;
  client: Client;
  databaseHealthy: () => Promise<boolean>;
  startedAt: number;
  version?: string;
}

function errorBody(requestId: string, code: BotApiErrorCode, message: string): BotApiErrorBody {
  return { error: { code, message, requestId } };
}

/**
 * Internal Bot API.
 *
 * - `/healthz` and `/readyz` are unauthenticated, read-only probes with no secrets.
 * - Everything under `/v1` requires HMAC-SHA256 with a 60s window, a single-use
 *   nonce and an optional IP allowlist.
 * - No CORS: only the dashboard server talks to this API.
 */
export async function createApiServer(deps: ApiDependencies) {
  const { env, logger, client } = deps;
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

      scope.get("/meta", (request) => {
        const meta: MetaDTO = {
          version,
          apiVersion: "v1",
          shards: client.shard?.count ?? client.options.shardCount ?? 1,
          pingMs: Math.max(0, Math.round(client.ws.ping)),
          uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
          guildCount: client.guilds.cache.size,
          userCount: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
          queueDepth: 0,
          startedAt: new Date(deps.startedAt).toISOString(),
        };
        return { data: meta, requestId: request.id };
      });
    },
    { prefix: BOT_API_PREFIX },
  );

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody(request.id, "NOT_FOUND", "Route not found.")),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
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

  return app;
}
