"use client";

import { useQuery } from "@tanstack/react-query";
import type { BotMeta } from "@nujum/shared";
import { Activity, WifiOff } from "lucide-react";
import { Badge } from "./ui/badge";
import type { BotResponse } from "../lib/live-types";

export function BotStatusBadge({ guildId }: { guildId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bot-status", guildId],
    queryFn: async (): Promise<BotResponse<BotMeta>> => {
      const response = await fetch(`/api/bot-status?guildId=${encodeURIComponent(guildId)}`, {
        cache: "no-store",
      });
      return (await response.json()) as BotResponse<BotMeta>;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const online = data?.ok === true && data.data !== undefined;
  const tone = online ? "success" : isLoading ? "warning" : "danger";
  const label = online
    ? `Bot online · ${data.data?.pingMs ?? 0} ms`
    : isLoading
      ? "Checking bot…"
      : "Bot offline · actions will queue";

  return (
    <Badge tone={tone}>
      {online ? <Activity className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {label}
    </Badge>
  );
}
