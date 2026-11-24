export const BOT_API_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "GUILD_NOT_FOUND",
  "BOT_OFFLINE",
  "UPSTREAM_ERROR",
  "INTERNAL",
] as const;

export type BotApiErrorCode = (typeof BOT_API_ERROR_CODES)[number];

export interface BotApiErrorBody {
  error: {
    code: BotApiErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface BotApiSuccessBody<T> {
  data: T;
  requestId: string;
}

export type BotApiResponseBody<T> = BotApiSuccessBody<T> | BotApiErrorBody;

export interface ApiActor {
  /** Discord user id of the dashboard operator. */
  id: string;
  type: "DASHBOARD" | "BOT" | "SYSTEM";
}

export interface AuditRequestContext {
  actor: ApiActor;
  ip?: string;
  userAgent?: string;
  requestId: string;
}
