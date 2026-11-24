import pino, { type Logger, type LoggerOptions } from "pino";
import type { BotEnv } from "../config/env";

/**
 * Structured logging with aggressive redaction. Tokens, cookies, HMAC headers
 * and database URLs must never reach stdout — logs are shipped off-box.
 */

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "headers.authorization",
  "headers.cookie",
  "headers['x-nujum-signature']",
  "headers['x-nujum-secret']",
  "token",
  "*.token",
  "*.secret",
  "*.password",
  "*.hmacSecret",
  "config.DISCORD_TOKEN",
  "config.DATABASE_URL",
  "config.BOT_API_HMAC_SECRET",
  "error.config.headers.authorization",
];

export type BotLogger = Logger;

export function createLogger(env: BotEnv, bindings: Record<string, unknown> = {}): BotLogger {
  const pretty =
    env.LOG_PRETTY === "true" || (env.LOG_PRETTY === undefined && env.NODE_ENV !== "production");

  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: "nujum-bot", env: env.NODE_ENV, ...bindings },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname,service,env",
              singleLine: false,
            },
          },
        }
      : {}),
  };

  return pino(options);
}
