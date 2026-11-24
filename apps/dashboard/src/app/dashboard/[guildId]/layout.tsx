import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  FileClock,
  LayoutDashboard,
  ListChecks,
  Mic2,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Blocks,
} from "lucide-react";
import { BotStatusBadge } from "../../../components/bot-status-badge";
import { Badge } from "../../../components/ui/badge";
import { requireGuildAccess } from "../../../lib/authz";

const links = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/security", label: "Security", icon: ShieldAlert },
  { href: "/verification", label: "Verification", icon: ShieldCheck },
  { href: "/modules", label: "Modules", icon: Blocks },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/join-to-create", label: "Join to create", icon: Mic2 },
  { href: "/live", label: "Live actions", icon: RadioTower },
  { href: "/queue", label: "Queue", icon: ListChecks },
  { href: "/audit", label: "Audit log", icon: FileClock },
] as const;

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  let context;
  try {
    context = await requireGuildAccess(guildId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div>
      <header className="border-b bg-surface/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Link href="/dashboard" className="hover:text-primary">
                Servers
              </Link>
              <span>/</span>
              <span>{context.guild.name}</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {context.guild.name}
              <Badge tone="info">{context.role.replace("_", " ")}</Badge>
            </h1>
          </div>
          <BotStatusBadge guildId={guildId} />
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto pb-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={`/dashboard/${guildId}${link.href}`}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-raised hover:text-foreground"
            >
              <link.icon className="h-3.5 w-3.5" /> {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <footer className="border-t px-6 py-5 text-[11px] text-muted">
        <Activity className="mr-1 inline h-3 w-3" />
        Configuration changes are applied to the bot without a restart. Sensitive changes require a
        recent identity check.
      </footer>
    </div>
  );
}
