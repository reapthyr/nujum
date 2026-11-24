/** Client-safe response shapes shared by route handlers and components. */
export interface BotResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  status?: number;
  offline: boolean;
  requestId?: string;
}

export interface LiveActionOutcome {
  status: "SENT" | "QUEUED";
  requestId?: string;
  messageId?: string;
}
