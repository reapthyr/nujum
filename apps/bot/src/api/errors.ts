/**
 * Safe, structured errors returned by the internal Bot API and by live actions.
 * Kept separate so feature services can throw them without importing the API
 * implementation (and creating a module cycle through `NujumClient`).
 */
export class ApiActionError extends Error {
  constructor(
    readonly code:
      | "BAD_REQUEST"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "GUILD_NOT_FOUND"
      | "RATE_LIMITED"
      | "INTERNAL",
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "ApiActionError";
  }
}
