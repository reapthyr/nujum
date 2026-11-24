"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ticketConfigSchema } from "@nujum/shared";
import { Ticket } from "lucide-react";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveTicketConfig } from "../app/actions/config";
import type { TicketConfigInput } from "../lib/data";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { FieldError, Input, Label, Textarea, Toggle } from "./ui/form";

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

export function TicketConfigForm({
  guildId,
  defaults,
}: {
  guildId: string;
  defaults: TicketConfigInput;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<TicketConfigInput>({
    resolver: zodResolver(ticketConfigSchema),
    defaultValues: defaults,
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await saveTicketConfig(guildId, values);
      if (result.ok) {
        toast.success("Ticket settings saved", {
          description: `Config version ${result.data.version} · ${result.data.changed.length} field(s) changed`,
        });
      } else {
        toast.error("Could not save ticket settings", { description: result.error });
      }
    });
  });

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" /> Ticket system
          </CardTitle>
          <CardDescription>
            Enable support tickets, choose where transcripts and logs go, and set per-user limits.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Toggle
                label="Enable tickets"
                description="Allow members to open tickets from the published panel."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="ratingEnabled"
            render={({ field }) => (
              <Toggle
                label="Ratings"
                description="Ask for a rating when a ticket is closed."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <div>
            <Label htmlFor="ticket-panel-channel">Panel channel id</Label>
            <Input
              id="ticket-panel-channel"
              placeholder="123456789012345678"
              {...register("panelChannelId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.panelChannelId?.message} />
          </div>
          <div>
            <Label htmlFor="transcript-channel">Transcript channel id</Label>
            <Input
              id="transcript-channel"
              placeholder="123456789012345678"
              {...register("transcriptChannelId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.transcriptChannelId?.message} />
          </div>
          <div>
            <Label htmlFor="ticket-log-channel">Log channel id</Label>
            <Input
              id="ticket-log-channel"
              placeholder="123456789012345678"
              {...register("logChannelId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.logChannelId?.message} />
          </div>
          <div>
            <Label htmlFor="ticket-support-roles">Support role ids</Label>
            <Controller
              control={control}
              name="supportRoleIds"
              render={({ field }) => (
                <Textarea
                  id="ticket-support-roles"
                  defaultValue={field.value.join(", ")}
                  onChange={(event) => field.onChange(splitList(event.target.value))}
                  placeholder="123456789012345678, 987654321098765432"
                />
              )}
            />
            <FieldError message={errors.supportRoleIds?.message} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits &amp; naming</CardTitle>
          <CardDescription>
            Channel names must include {"{number}"} so each ticket stays unique.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="max-open-per-user">Max open tickets per member</Label>
            <Input
              id="max-open-per-user"
              type="number"
              {...register("maxOpenPerUser", { valueAsNumber: true })}
            />
            <FieldError message={errors.maxOpenPerUser?.message} />
          </div>
          <div>
            <Label htmlFor="inactivity-hours">Close after (hours)</Label>
            <Input
              id="inactivity-hours"
              type="number"
              {...register("inactivityHours", { valueAsNumber: true })}
            />
            <FieldError message={errors.inactivityHours?.message} />
          </div>
          <div>
            <Label htmlFor="warn-before-hours">Warn before close (hours)</Label>
            <Input
              id="warn-before-hours"
              type="number"
              {...register("warnBeforeHours", { valueAsNumber: true })}
            />
            <FieldError message={errors.warnBeforeHours?.message} />
          </div>
          <div>
            <Label htmlFor="naming-format">Channel naming format</Label>
            <Input id="naming-format" {...register("namingFormat")} />
            <FieldError message={errors.namingFormat?.message} />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border bg-surface/95 p-4 backdrop-blur">
        <p className="text-xs text-muted">
          Saving bumps the config version and notifies every connected bot process.
        </p>
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? "Saving…" : "Save ticket settings"}
        </Button>
      </div>
    </form>
  );
}
