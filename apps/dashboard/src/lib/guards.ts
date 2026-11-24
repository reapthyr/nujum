import { requireGuildAccess, type GuildContext } from "./authz";
import { assertRateLimit, assertSameOrigin } from "./http";

/** CSRF + per-guild rate limiting + Discord authorization for every mutation. */
export async function guardGuildAction(guildId: string, operation: string): Promise<GuildContext> {
  await assertSameOrigin();
  assertRateLimit(`${operation}:${guildId}`);
  return requireGuildAccess(guildId);
}
