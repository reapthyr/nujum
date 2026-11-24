import Link from "next/link";
import {
  FileClock,
  ListChecks,
  Mic2,
  RadioTower,
  ShieldAlert,
  Sparkles,
  Ticket,
} from "lucide-react";
import { requireGuildAccess } from "../../../lib/authz";
import { createBotClient } from "../../../lib/bot-client";
import { loadOverviewStats } from "../../../lib/data";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  StatCard,
} from "../../../components/ui/card";

export const metadata = { title: "Overview" };

const shortcuts = [
  {
    href: "security",
    label: "Security",
    copy: "Raid, nuke, spam and lockdown controls",
    icon: ShieldAlert,
  },
  {
    href: "verification",
    label: "Verification",
    copy: "Gate new members and publish the panel",
    icon: Sparkles,
  },
  {
    href: "live",
    label: "Live actions",
    copy: "Send messages and announcements safely",
    icon: RadioTower,
  },
  {
    href: "audit",
    label: "Audit log",
    copy: "Review and revert configuration changes",
    icon: FileClock,
  },
];

export default async function GuildOverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const ctx = await requireGuildAccess(guildId);
  const [stats, bot] = await Promise.all([
    loadOverviewStats(guildId),
    createBotClient(ctx.session.user.discordId).getMeta(),
  ]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Server overview</p>
          <CardTitle className="text-2xl">{ctx.guild.name}</CardTitle>
          <CardDescription>
            {bot.ok && bot.data
              ? `Bot v${bot.data.version} · ${bot.data.guildCount} guilds · queue depth ${bot.data.queueDepth}`
              : "The bot is offline. Configuration stays available and live actions will queue."}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Enabled modules" value={stats.modules} icon={<Sparkles />} />
        <StatCard label="Open threats" value={stats.threats} icon={<ShieldAlert />} />
        <StatCard label="Queued actions" value={stats.queueDepth} icon={<ListChecks />} />
        <StatCard label="Audit entries" value={stats.auditCount} icon={<FileClock />} />
        <StatCard label="Open tickets" value={stats.openTickets} icon={<Ticket />} />
        <StatCard label="JTC rooms" value={stats.jtcRooms} icon={<Mic2 />} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {shortcuts.map((shortcut) => (
          <Link key={shortcut.href} href={`/dashboard/${guildId}/${shortcut.href}`}>
            <Card className="h-full transition hover:border-primary/40">
              <shortcut.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-sm font-semibold">{shortcut.label}</h3>
              <p className="mt-1 text-xs text-muted">{shortcut.copy}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
