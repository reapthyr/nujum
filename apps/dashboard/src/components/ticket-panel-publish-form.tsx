"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { publishTicketPanelBodySchema } from "@nujum/shared";
import { RadioTower } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";
import { publishTicketPanelAction } from "../app/actions/live";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { FieldError, Input, Label } from "./ui/form";

type PublishInput = z.input<typeof publishTicketPanelBodySchema>;
type PublishOutput = z.output<typeof publishTicketPanelBodySchema>;

function optionalId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

export function TicketPanelPublishForm({
  guildId,
  defaultChannelId,
}: {
  guildId: string;
  defaultChannelId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PublishInput, unknown, PublishOutput>({
    resolver: zodResolver(publishTicketPanelBodySchema),
    defaultValues: { channelId: defaultChannelId ?? null, preview: false },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await publishTicketPanelAction(guildId, values);
      if (result.ok) {
        toast.success(`Ticket panel ${result.data.status}`, {
          description:
            result.data.status === "QUEUED"
              ? "The bot will publish it when it reconnects."
              : "The bot confirmed the panel was published.",
        });
      } else {
        toast.error("Could not publish ticket panel", { description: result.error });
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RadioTower className="h-4 w-4 text-primary" /> Publish ticket panel
        </CardTitle>
        <CardDescription>
          Posts the configured categories as buttons or a dropdown. When the bot is offline the
          request is queued safely.
        </CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <Label htmlFor="publish-ticket-channel">Channel id (optional)</Label>
          <Input
            id="publish-ticket-channel"
            placeholder="Leave empty to use the configured panel channel"
            {...register("channelId", { setValueAs: optionalId })}
          />
          <FieldError message={errors.channelId?.message} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish panel"}
        </Button>
      </form>
    </Card>
  );
}
