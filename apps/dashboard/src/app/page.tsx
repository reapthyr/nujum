import Link from "next/link";
import { ArrowRight, Bot, LockKeyhole, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { Reveal } from "../components/reveal";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

const features = [
  {
    icon: ShieldCheck,
    title: "Security that reacts",
    copy: "Anti-raid, anti-nuke, anti-spam and phishing defenses with live verification controls.",
  },
  {
    icon: Radio,
    title: "Zero-restart config",
    copy: "Every change flows through PostgreSQL to the bot in seconds, with a 10-second fallback.",
  },
  {
    icon: Bot,
    title: "Live bot actions",
    copy: "Send messages, publish panels and manage lockdown from one place — even while the bot is offline.",
  },
  {
    icon: LockKeyhole,
    title: "Least privilege",
    copy: "Discord OAuth, server-side authorization, short re-auth windows and a fully signed internal API.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Nujum</span>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              Open dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-20">
          <Badge tone="info" className="w-fit">
            Built for serious Discord communities
          </Badge>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Your community, <span className="text-primary">under control.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
            One secure command center for configuration, moderation, verification and live bot
            operations. Nujum keeps working when the bot is offline and never asks you to trade
            convenience for safety.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button>
                Manage your servers <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline">Sign in with Discord</Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.06}>
              <Card className="h-full">
                <feature.icon className="h-5 w-5 text-primary" />
                <h2 className="mt-4 text-sm font-semibold">{feature.title}</h2>
                <p className="mt-2 text-xs leading-relaxed text-muted">{feature.copy}</p>
              </Card>
            </Reveal>
          ))}
        </section>
      </div>
    </main>
  );
}
