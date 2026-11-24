/**
 * Error taxonomy.
 *
 * `userMessage` is safe to show in Discord; `code` is stable for dashboards and
 * logs. Anything unexpected becomes a generic message, never a stack trace.
 */

export class BotError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly meta: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    userMessage: string,
    options: { cause?: unknown; meta?: Record<string, unknown> } = {},
  ) {
    super(userMessage, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BotError";
    this.code = code;
    this.userMessage = userMessage;
    this.meta = Object.freeze({ ...options.meta });
  }
}

export const ERROR_CODES = {
  missingPermissions: "MISSING_PERMISSIONS",
  botMissingPermissions: "BOT_MISSING_PERMISSIONS",
  hierarchy: "HIERARCHY",
  guildOnly: "GUILD_ONLY",
  dmOnly: "DM_ONLY",
  ownerOnly: "OWNER_ONLY",
  nsfwOnly: "NSFW_ONLY",
  cooldown: "COOLDOWN",
  rateLimited: "RATE_LIMITED",
  invalidInput: "INVALID_INPUT",
  notFound: "NOT_FOUND",
  moduleDisabled: "MODULE_DISABLED",
  maintenance: "MAINTENANCE",
  internal: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function toUserMessage(error: unknown): string {
  if (error instanceof BotError) return error.userMessage;
  return "Something went wrong on our side. Please try again in a moment.";
}

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  cause?: string;
}

/** Structured, redaction-friendly error payload for pino. */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof BotError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.cause instanceof Error ? { cause: error.cause.message } : {}),
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { name: "UnknownError", message: String(error) };
}

/** Wraps an async call with a timeout so a hung dependency cannot stall a handler. */
export async function withTimeout<T>(
  operation: Promise<T>,
  ms: number,
  message = "operation timed out",
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new BotError(ERROR_CODES.internal, message)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
