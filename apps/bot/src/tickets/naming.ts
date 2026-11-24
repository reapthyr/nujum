import { BotError, ERROR_CODES } from "../lib/errors";

const SAFE_NAME = /^[a-z0-9{}_-]+$/;

/**
 * Renders the configured ticket naming format. Only a single `{number}`
 * placeholder is accepted; the output is always Discord-channel safe.
 */
export function formatTicketName(format: string, number: number): string {
  if (!SAFE_NAME.test(format) || !format.includes("{number}")) {
    throw new BotError(ERROR_CODES.invalidInput, "The ticket naming format is invalid.");
  }
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new BotError(ERROR_CODES.internal, "Ticket number is invalid.");
  }
  const name = format.split("{number}").join(String(number));
  return name.slice(0, 100);
}
