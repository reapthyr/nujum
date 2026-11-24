import { ticketPanelInputSchema } from "@nujum/shared";
import type { z } from "zod";

/** Shared contract is authoritative; category ids are cuids, not snowflakes. */
export function parseTicketPanelInput(raw: unknown): z.infer<typeof ticketPanelInputSchema> {
  const parsed = ticketPanelInputSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error("Invalid ticket panel input: check the channel, embed and categories.");
}
