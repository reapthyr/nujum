import { cookies } from "next/headers";
import { getPrisma } from "@nujum/shared/prisma";
import { getEnv } from "../env";
import { requireSession, type GuildContext } from "./authz";
import { assertReauthenticated, SecurityError } from "./http";

/** Reads the session row behind the httpOnly cookie and enforces the 15-minute window. */
export async function requireRecentReauth(): Promise<void> {
  const session = await requireSession();
  const cookieName =
    getEnv().NODE_ENV === "production" ? "__Secure-nujum.session-token" : "nujum.session-token";
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) throw new SecurityError("Your session is missing. Please sign in again.", "REAUTH");
  const stored = await getPrisma().session.findUnique({
    where: { sessionToken: token },
    select: { expires: true, reauthenticatedAt: true, userId: true },
  });
  if (!stored || stored.userId !== session.user.id || stored.expires.getTime() < Date.now()) {
    throw new SecurityError("Your session expired. Please sign in again.", "REAUTH");
  }
  assertReauthenticated(stored.reauthenticatedAt);
}

/** Every destructive or security-sensitive server action calls this first. */
export async function assertSensitive(_ctx: GuildContext): Promise<void> {
  await requireRecentReauth();
}
