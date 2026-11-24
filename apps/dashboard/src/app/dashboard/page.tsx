import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Server } from "lucide-react";
import { auth } from "../../auth";
import { Badge } from "../../components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  canManageGuild,
  isSuperAdmin,
  listDiscordGuilds,
  parsePermissionBits,
} from "../../lib/authz";
import { getEnv } from "../../env";

export const metadata = { title: "Servers" };

export default async function GuildListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const guilds = await listDiscordGuilds(session).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to list Discord guilds:", error instanceof Error ? error.message : error);
    return [];
  });
  const ownerIds = getEnv().DASHBOARD_OWNER_IDS;
  const manageable = guilds.filter(
    (guild) =>
      isSuperAdmin(session.user.discordId, ownerIds) ||
      canManageGuild(parsePermissionBits(guild.permissions), guild.owner),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your servers</h1>
          <p className="mt-2 text-sm text-muted">
            Choose a server to configure security, verification and live operations.
          </p>
        </div>
        <Badge tone="neutral">{manageable.length} manageable</Badge>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {manageable.map((guild) => (
          <Link key={guild.id} href={`/dashboard/${guild.id}`} className="group">
            <Card className="h-full transition group-hover:border-primary/40 group-hover:bg-surface">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
                    {guild.icon ? (
                      <img
                        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=96`}
                        alt=""
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    ) : (
                      <Server className="h-5 w-5" />
                    )}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:text-primary" />
                </div>
                <CardTitle className="mt-4">{guild.name}</CardTitle>
                <CardDescription>
                  {guild.owner ? "Server owner" : "Manage Server permission"}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {manageable.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="text-sm text-muted">
            No servers with owner or Manage Server permissions were found. Ask a server owner to
            grant access, or check that the Discord OAuth <code>guilds</code> scope is approved.
          </p>
        </Card>
      ) : null}
    </main>
  );
}
