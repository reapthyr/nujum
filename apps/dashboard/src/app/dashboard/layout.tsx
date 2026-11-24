import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LayoutDashboard, ShieldAlert } from "lucide-react";
import { auth } from "../../auth";
import { AccountMenu } from "../../components/account-menu";
import { Badge } from "../../components/ui/badge";
import { getEnv } from "../../env";
import { isSuperAdmin, listDiscordGuilds } from "../../lib/authz";

export const metadata = { title: "Dashboard" };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || session.user.isBlacklisted) redirect("/login");

  const guilds = await listDiscordGuilds(session).catch(() => []);
  const superAdmin = isSuperAdmin(session.user.discordId, getEnv().DASHBOARD_OWNER_IDS);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px]">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r bg-surface/40 p-5 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-1">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/20 text-primary">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Nujum</p>
            <p className="text-[11px] text-muted">Command center</p>
          </div>
        </Link>

        <div className="mt-8 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Servers</p>
          <Badge tone="info">{guilds.length}</Badge>
        </div>
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto pr-1">
          {guilds.length === 0 ? (
            <p className="rounded-xl border border-dashed p-3 text-xs text-muted">
              No manageable servers found. Check the Discord <code>guilds</code> scope.
            </p>
          ) : null}
          {guilds.map((guild) => (
            <Link
              key={guild.id}
              href={`/dashboard/${guild.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
            >
              {guild.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-xs text-primary">
                  {guild.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{guild.name}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            </Link>
          ))}
        </nav>

        {superAdmin ? (
          <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted">
            You have <span className="font-medium text-primary">super-admin</span> access to every
            server.
          </div>
        ) : null}
        <div className="border-t pt-4">
          <AccountMenu username={session.user.username} path="/dashboard" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b px-5 py-4 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <LayoutDashboard className="h-4 w-4 text-primary" /> Nujum
          </Link>
          <AccountMenu username={session.user.username} path="/dashboard" />
        </header>
        {children}
      </div>
    </div>
  );
}
