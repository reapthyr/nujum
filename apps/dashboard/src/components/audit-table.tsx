"use client";

import { diffObjects } from "@nujum/shared";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revertAuditAction } from "../app/actions/config";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { AuditView } from "../lib/data";

const REVERTIBLE = new Set([
  "security.config.update",
  "verification.config.update",
  "module.update",
]);

function display(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

export function AuditTable({ guildId, entries }: { guildId: string; entries: AuditView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revert(id: string) {
    startTransition(async () => {
      const result = await revertAuditAction(guildId, id);
      if (result.ok) {
        toast.success("Change reverted", { description: `Config version ${result.data.version}` });
      } else {
        toast.error("Could not revert", { description: result.error });
      }
    });
  }

  if (entries.length === 0) {
    return (
      <Card className="text-sm text-muted">No configuration changes have been recorded yet.</Card>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const changes = diffObjects(entry.before, entry.after);
        const isOpen = expanded === entry.id;
        const canRevert = REVERTIBLE.has(entry.action) && !entry.revertedAt;
        return (
          <Card key={entry.id} className="p-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 p-4 text-left"
              onClick={() => setExpanded(isOpen ? null : entry.id)}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <code className="text-xs text-primary">{entry.action}</code>
                  {entry.revertedAt ? <Badge tone="warning">Reverted</Badge> : null}
                </span>
                <span className="mt-1 block truncate text-xs text-muted">
                  {entry.actorType} · {entry.actorId} · {new Date(entry.createdAt).toLocaleString()}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted transition ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen ? (
              <div className="border-t p-4">
                {entry.reason ? (
                  <p className="mb-3 text-xs text-muted">Reason: {entry.reason}</p>
                ) : null}
                <div className="space-y-1.5">
                  {changes.slice(0, 40).map((change) => (
                    <div
                      key={change.path}
                      className="rounded-lg bg-background/50 px-3 py-2 text-xs"
                    >
                      <p className="font-medium text-foreground">{change.path}</p>
                      <p className="mt-1 text-muted">
                        <span className="text-danger">{display(change.before)}</span>
                        {" → "}
                        <span className="text-success">{display(change.after)}</span>
                      </p>
                    </div>
                  ))}
                  {changes.length === 0 ? (
                    <p className="text-xs text-muted">No field differences were recorded.</p>
                  ) : null}
                </div>
                {canRevert ? (
                  <Button
                    variant="danger"
                    size="sm"
                    className="mt-4"
                    disabled={pending}
                    onClick={() => revert(entry.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Revert this change
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
