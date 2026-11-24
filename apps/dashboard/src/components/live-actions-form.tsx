"use client";

import {
  announcementBodySchema,
  lockdownBodySchema,
  publishVerificationBodySchema,
  sendMessageBodySchema,
  type BotGuildSnapshot,
} from "@nujum/shared";
import { LoaderCircle, Megaphone, RadioTower, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  publishVerificationPanelAction,
  sendAnnouncementAction,
  sendMessageAction,
  setLockdownAction,
} from "../app/actions/live";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input, Label, Textarea, Toggle } from "./ui/form";

type Tab = "message" | "announcement" | "panel" | "lockdown";

const tabs: Array<{ key: Tab; label: string; icon: typeof RadioTower }> = [
  { key: "message", label: "Message", icon: RadioTower },
  { key: "announcement", label: "Announcement", icon: Megaphone },
  { key: "panel", label: "Panel", icon: ShieldCheck },
  { key: "lockdown", label: "Lockdown", icon: ShieldAlert },
];

export function LiveActionsForm({
  guildId,
  snapshot,
}: {
  guildId: string;
  snapshot: BotGuildSnapshot | null;
}) {
  const [tab, setTab] = useState<Tab>("message");
  const [pending, startTransition] = useTransition();
  const [channelId, setChannelId] = useState(snapshot?.channels[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [mentionEveryone, setMentionEveryone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [lockdown, setLockdown] = useState(false);

  function report(
    result: { ok: boolean; error?: string; data?: { status: string } },
    name: string,
  ) {
    if (result.ok) {
      toast.success(result.data?.status === "QUEUED" ? `${name} queued` : `${name} sent`, {
        description:
          result.data?.status === "QUEUED"
            ? "The bot will apply it automatically when it reconnects."
            : "The bot confirmed the action.",
      });
    } else {
      toast.error(`${name} failed`, { description: result.error });
    }
  }

  function submitMessage() {
    const parsed = sendMessageBodySchema.safeParse({ channelId, content });
    if (!parsed.success) {
      toast.error("Enter a channel and a message (max 2000 characters).");
      return;
    }
    startTransition(async () => report(await sendMessageAction(guildId, parsed.data), "Message"));
  }

  function submitAnnouncement() {
    const parsed = announcementBodySchema.safeParse({
      channelId,
      content,
      mentionEveryone,
      confirm: mentionEveryone ? confirmed : undefined,
    });
    if (!parsed.success) {
      toast.error("Invalid announcement", { description: parsed.error.issues[0]?.message });
      return;
    }
    startTransition(async () =>
      report(await sendAnnouncementAction(guildId, parsed.data), "Announcement"),
    );
  }

  function submitPanel() {
    const parsed = publishVerificationBodySchema.safeParse({
      channelId: channelId || undefined,
    });
    if (!parsed.success) {
      toast.error("Invalid panel target.");
      return;
    }
    startTransition(async () =>
      report(await publishVerificationPanelAction(guildId, parsed.data), "Panel"),
    );
  }

  function submitLockdown() {
    const parsed = lockdownBodySchema.safeParse({
      active: lockdown,
      reason: reason || undefined,
    });
    if (!parsed.success) {
      toast.error("Invalid lockdown request.");
      return;
    }
    startTransition(async () => report(await setLockdownAction(guildId, parsed.data), "Lockdown"));
  }

  const channelOptions = snapshot?.channels.filter((channel) => channel.type === "text") ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live bot actions</CardTitle>
        <CardDescription>
          Every request is HMAC-signed and re-checked against Discord state. When the bot is
          offline, Nujum writes a durable queue entry instead.
        </CardDescription>
      </CardHeader>

      <div className="flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <Button
            key={entry.key}
            variant={tab === entry.key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(entry.key)}
          >
            <entry.icon className="h-3.5 w-3.5" /> {entry.label}
          </Button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {tab !== "lockdown" ? (
          <div>
            <Label htmlFor="channel">Channel</Label>
            {channelOptions.length > 0 ? (
              <select
                id="channel"
                className="w-full rounded-xl border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              >
                {channelOptions.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="channel"
                placeholder="Channel id (bot offline)"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              />
            )}
            <p className="mt-1 text-xs text-muted">
              {snapshot ? "Live channels from Discord." : "Bot offline — enter a channel id."}
            </p>
          </div>
        ) : null}

        {tab === "message" || tab === "announcement" ? (
          <>
            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                maxLength={2000}
                placeholder="Write something for your community…"
                onChange={(event) => setContent(event.target.value)}
              />
            </div>
            {tab === "announcement" ? (
              <>
                <Toggle
                  label="Mention @everyone"
                  description="Requires explicit confirmation and the bot's Mention Everyone permission."
                  checked={mentionEveryone}
                  onChange={setMentionEveryone}
                />
                {mentionEveryone ? (
                  <Toggle
                    label="Confirm mass mention"
                    checked={confirmed}
                    onChange={setConfirmed}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {tab === "lockdown" ? (
          <>
            <Toggle
              label="Activate lockdown"
              description="Deny @everyone and unsafe role/member overwrites in text channels."
              checked={lockdown}
              onChange={setLockdown}
            />
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                maxLength={300}
                placeholder="Incident response"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </>
        ) : null}

        <Button
          disabled={pending}
          onClick={() => {
            if (tab === "message") submitMessage();
            else if (tab === "announcement") submitAnnouncement();
            else if (tab === "panel") submitPanel();
            else submitLockdown();
          }}
        >
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {tab === "lockdown" ? "Apply lockdown" : "Send action"}
        </Button>
      </div>
    </Card>
  );
}
