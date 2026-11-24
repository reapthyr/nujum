"use client";

import { Ban, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelQueuedAction, drainQueueAction } from "../app/actions/live";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { QueueView } from "../lib/data";

export function QueueTable({ guildId, entries }: { guildId: string; entries: QueueView[] }) {
  const [pending, startTransition] = useTransition();
  const [draining, setDraining] = useState(false);

  function drain() {
    setDraining(true);
    startTransition(async () => {
      const result = await drainQueueAction(guildId);
      if (result.ok) toast.success("Queue drain requested");
      else toast.error("Could not drain queue", { description: result.error });
      setDraining(false);
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const result = await cancelQueuedAction(guildId, id);
      if (result.ok) toast.success("Queued action cancelled");
      else toast.error("Could not cancel action", { description: result.error });
    });
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Pending bot actions</h2>
          <p className="mt-1 text-xs text-muted">
            Queued actions are durable, validated again by the bot and drained on reconnect.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={pending || draining} onClick={drain}>
          <RefreshCw className={`h-3.5 w-3.5 ${draining ? "animate-spin" : ""}`} /> Drain now
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
          The queue is empty.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {entry.type}
                  <Badge
                    tone={
                      entry.status === "FAILED"
                        ? "danger"
                        : entry.status === "PROCESSING"
                          ? "info"
                          : "warning"
                    }
                  >
                    {entry.status}
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(entry.createdAt).toLocaleString()} · attempt {entry.attempts} ·{" "}
                  {entry.createdBy}
                </p>
                {entry.lastError ? (
                  <p className="mt-1 text-xs text-danger">{entry.lastError}</p>
                ) : null}
              </div>
              {entry.status === "PENDING" ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() => cancel(entry.id)}
                >
                  <Ban className="h-3.5 w-3.5" /> Cancel
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
