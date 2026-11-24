import { getPrisma } from "@nujum/shared/prisma";
import type { Session } from "next-auth";
import { cache } from "react";
import { auth } from "../auth";
import { getEnv } from "../env";
import {
  assertGuildAccess,
  filterManageableGuilds,
  guildIdSchema,
  listDiscordGuilds,
  type DiscordGuildSummary,
  type GuildRole,
} from "./discord";
import { SecurityError } from "./http";

export {
  assertGuildAccess,
  canManageGuild,
  guildIdSchema,
  isSuperAdmin,
  listDiscordGuilds,
  parsePermissionBits,
} from "./discord";
export type { DiscordGuildSummary, GuildRole } from "./discord";

export interface GuildContext {
  session: Session;
  guild: DiscordGuildSummary;
  role: GuildRole;
}

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id || session.user.isBlacklisted || !session.user.discordId) {
    throw new SecurityError("Please sign in to continue.", "FORBIDDEN");
  }
  return session;
}

/**
 * Discord guilds where the signed-in user has management access and Nujum is
 * installed. Cached per request so nested layouts share one Discord API call.
 */
export const listManageableGuilds = cache(
  async (userId: string, discordId: string): Promise<DiscordGuildSummary[]> => {
    const [guilds, activeGuilds] = await Promise.all([
      listDiscordGuilds(userId, discordId),
      getPrisma().guild.findMany({
        where: { leftAt: null },
        select: { id: true },
      }),
    ]);
    const botGuildIds = new Set(activeGuilds.map((guild) => guild.id));
    return filterManageableGuilds(
      guilds,
      botGuildIds,
      discordId,
      getEnv().DASHBOARD_OWNER_IDS,
    );
  },
);

/** The single authorization gate used by every guild page and server action. */
export async function requireGuildAccess(rawGuildId: string): Promise<GuildContext> {
  const parsedId = guildIdSchema.safeParse(rawGuildId);
  if (!parsedId.success) throw new SecurityError("Invalid server id.", "FORBIDDEN");
  const session = await requireSession();
  const guilds = await listManageableGuilds(session.user.id, session.user.discordId);
  const guild = guilds.find((entry) => entry.id === parsedId.data);
  if (!guild) {
    throw new SecurityError(
      "That server is not connected to Nujum, or you do not have permission to manage it.",
      "FORBIDDEN",
    );
  }

  const role = assertGuildAccess(guild, session.user.discordId, getEnv().DASHBOARD_OWNER_IDS);
  return { session, guild, role };
}
