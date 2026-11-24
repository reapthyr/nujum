import { z } from "zod";
import { getPrisma } from "@nujum/shared/prisma";
import type { Session } from "next-auth";
import { getEnv } from "../env";
import { SecurityError } from "./http";

export const guildIdSchema = z.string().regex(/^\d{16,20}$/, "must be a Discord snowflake id");

export type GuildRole = "SUPER_ADMIN" | "OWNER" | "ADMIN";

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  ownerId: string;
  permissions: string;
}

const discordGuildSchema = z.object({
  id: z.string().regex(/^\d{16,20}$/),
  name: z.string().min(1).max(100),
  icon: z.string().nullable().optional(),
  // /users/@me/guilds returns `owner` but not `owner_id`; only the guild
  // detail endpoint has the latter, so keep it optional here.
  owner: z.boolean().optional(),
  owner_id: z.string().optional().default(""),
  permissions: z.string().regex(/^\d+$/),
});

const DISCORD_ADMINISTRATOR = 1n << 3n;
const DISCORD_MANAGE_GUILD = 1n << 5n;

export function parsePermissionBits(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function canManageGuild(bits: bigint, isOwner: boolean): boolean {
  return isOwner || (bits & (DISCORD_ADMINISTRATOR | DISCORD_MANAGE_GUILD)) !== 0n;
}

export function isSuperAdmin(discordId: string, ownerIds: readonly string[]): boolean {
  return ownerIds.includes(discordId);
}

/**
 * A server is only usable when Nujum is installed there and the signed-in user
 * can manage it. Super admins still only see servers the bot is in.
 */
export function filterManageableGuilds(
  guilds: readonly DiscordGuildSummary[],
  botGuildIds: ReadonlySet<string>,
  discordId: string,
  ownerIds: readonly string[],
): DiscordGuildSummary[] {
  const superAdmin = isSuperAdmin(discordId, ownerIds);
  return guilds.filter(
    (guild) =>
      botGuildIds.has(guild.id) &&
      (superAdmin || canManageGuild(parsePermissionBits(guild.permissions), guild.owner)),
  );
}

export function assertGuildAccess(
  guild: DiscordGuildSummary,
  discordId: string,
  ownerIds: readonly string[],
): GuildRole {
  if (isSuperAdmin(discordId, ownerIds)) return "SUPER_ADMIN";
  if (guild.owner || guild.ownerId === discordId) return "OWNER";
  if (canManageGuild(parsePermissionBits(guild.permissions), guild.owner)) return "ADMIN";
  throw new SecurityError("You do not have permission to manage that server.", "FORBIDDEN");
}

async function discordAccount(userId: string, discordId: string): Promise<string> {
  const account = await getPrisma().account.findUnique({
    where: {
      provider_providerAccountId: { provider: "discord", providerAccountId: discordId },
    },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });
  if (!account?.access_token) {
    throw new SecurityError("Discord authorization expired. Please sign in again.", "FORBIDDEN");
  }
  if (account.expires_at && account.expires_at * 1000 > Date.now() + 60_000) {
    return account.access_token;
  }
  if (!account.refresh_token) {
    throw new SecurityError("Discord authorization expired. Please sign in again.", "FORBIDDEN");
  }

  const env = getEnv();
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.AUTH_DISCORD_ID,
      client_secret: env.AUTH_DISCORD_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new SecurityError("Discord authorization expired. Please sign in again.", "FORBIDDEN");
  }
  const raw: unknown = await response.json();
  const refreshed = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().min(1),
      expires_in: z.number().int().positive(),
      scope: z.string().optional(),
    })
    .safeParse(raw);
  if (!refreshed.success) {
    throw new SecurityError("Discord returned an invalid token response.", "FORBIDDEN");
  }
  await getPrisma().account.updateMany({
    where: { userId, provider: "discord", providerAccountId: discordId },
    data: {
      access_token: refreshed.data.access_token,
      refresh_token: refreshed.data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + refreshed.data.expires_in,
      token_type: "Bearer",
      ...(refreshed.data.scope ? { scope: refreshed.data.scope } : {}),
    },
  });
  return refreshed.data.access_token;
}

export function parseDiscordGuilds(raw: unknown): DiscordGuildSummary[] {
  const parsed = z.array(discordGuildSchema).safeParse(raw);
  if (!parsed.success) {
    throw new SecurityError("Discord returned an invalid guild list.", "FORBIDDEN");
  }
  return parsed.data.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
    owner: guild.owner ?? false,
    ownerId: guild.owner_id,
    permissions: guild.permissions,
  }));
}

export async function listDiscordGuilds(session: Session): Promise<DiscordGuildSummary[]> {
  const token = await discordAccount(session.user.id, session.user.discordId);
  const response = await fetch("https://discord.com/api/v10/users/@me/guilds?limit=200", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new SecurityError(
      "Discord guilds could not be loaded. Please sign in again.",
      "FORBIDDEN",
    );
  }
  return parseDiscordGuilds(await response.json());
}
