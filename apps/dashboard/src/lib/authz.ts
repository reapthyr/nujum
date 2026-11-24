import { getPrisma } from "@nujum/shared/prisma";
import type { Session } from "next-auth";
import { auth } from "../auth";
import { getEnv } from "../env";
import {
  assertGuildAccess,
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

/** The single authorization gate used by every guild page and server action. */
export async function requireGuildAccess(rawGuildId: string): Promise<GuildContext> {
  const parsedId = guildIdSchema.safeParse(rawGuildId);
  if (!parsedId.success) throw new SecurityError("Invalid server id.", "FORBIDDEN");
  const session = await requireSession();
  const guilds = await listDiscordGuilds(session);
  const guild = guilds.find((entry) => entry.id === parsedId.data);
  if (!guild) throw new SecurityError("You are not a member of that server.", "FORBIDDEN");

  const role = assertGuildAccess(guild, session.user.discordId, getEnv().DASHBOARD_OWNER_IDS);
  await getPrisma().guild.upsert({
    where: { id: guild.id },
    create: { id: guild.id, name: guild.name, iconHash: guild.icon, ownerId: guild.ownerId },
    update: { name: guild.name, iconHash: guild.icon, ownerId: guild.ownerId, leftAt: null },
  });
  return { session, guild, role };
}
