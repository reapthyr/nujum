import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Discord from "next-auth/providers/discord";
import { getPrisma } from "@nujum/shared/prisma";
import { getEnv } from "./env";

/** Extra fields carried from the Discord sign-in callback into the adapter. */
type DiscordAdapterUser = AdapterUser & {
  discordId?: string;
  globalName?: string | null;
  avatar?: string | null;
};

/**
 * Auth.js v5 with Discord OAuth and database sessions.
 *
 * `identify` is required; `guilds` lets the dashboard authorize guild access on
 * the server without ever sending an OAuth token to the browser.
 */
export function createAuthConfig(): NextAuthConfig {
  const env = getEnv();
  const prisma = getPrisma();
  const adapter: Adapter = PrismaAdapter(prisma);
  const baseCreateUser = adapter.createUser?.bind(adapter);
  if (!baseCreateUser) throw new Error("Auth adapter is missing createUser");
  adapter.createUser = async (user: AdapterUser) => {
    // Auth.js sends generic `name`/`image` fields, but the Prisma User model
    // stores Discord-specific columns. Map them here and drop the unknown keys.
    const { name, image, ...data } = user as DiscordAdapterUser;
    const mapped = {
      ...data,
      username: name ?? "Discord user",
      globalName: name ?? null,
      avatar: image ?? null,
      discordId: data.discordId,
    } as AdapterUser;
    return baseCreateUser(mapped);
  };

  return {
    adapter,
    providers: [
      Discord({
        clientId: env.AUTH_DISCORD_ID,
        clientSecret: env.AUTH_DISCORD_SECRET,
        // Discord now sends RFC 9207 `iss`; Auth.js's built-in provider has no
        // issuer and would reject it against its https://authjs.dev placeholder.
        issuer: "https://discord.com",
        authorization: { params: { scope: "identify guilds" } },
      }),
    ],
    events: {
      /** A completed OAuth flow is a fresh identity check for sensitive actions. */
      async signIn({ user }) {
        if (!user.id) return;
        try {
          await prisma.session.updateMany({
            where: { userId: user.id },
            data: { reauthenticatedAt: new Date() },
          });
        } catch {
          // Session creation still succeeds; the 15-minute guard simply stays active.
        }
      },
    },
    session: {
      strategy: "database",
      maxAge: env.SESSION_MAX_AGE_SECONDS,
      updateAge: env.SESSION_UPDATE_AGE_SECONDS,
    },
    pages: { signIn: "/login" },
    trustHost: true,
    cookies: {
      sessionToken: {
        name:
          env.NODE_ENV === "production" ? "__Secure-nujum.session-token" : "nujum.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          secure: env.NODE_ENV === "production",
          path: "/",
        },
      },
    },
    callbacks: {
      async signIn({ account, user }) {
        if (account?.provider !== "discord") return false;
        const existing = await prisma.user.findFirst({
          where: { discordId: account.providerAccountId },
          select: { isBlacklisted: true },
        });
        if (existing?.isBlacklisted) return false;

        // Auth.js assigns a random internal id before createUser; the real
        // Discord id lives on the linked account. Carry it into the adapter
        // so the User.discordId unique column is populated correctly.
        const discordUser = user as DiscordAdapterUser;
        discordUser.discordId = account.providerAccountId;
        discordUser.globalName = user.name ?? null;
        discordUser.avatar = user.image ?? null;
        return Boolean(user);
      },
      async session({ session, user }) {
        const stored = await prisma.user.findUnique({
          where: { id: user.id },
          select: { discordId: true, username: true, isBlacklisted: true },
        });
        session.user.id = user.id;
        session.user.discordId = stored?.discordId ?? "";
        session.user.username = stored?.username ?? user.name ?? "Discord user";
        session.user.isBlacklisted = stored?.isBlacklisted ?? false;
        return session;
      },
    },
  };
}

const config = createAuthConfig();
export const { handlers, auth, signIn, signOut } = NextAuth(config);
