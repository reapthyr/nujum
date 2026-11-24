"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { jtcConfigSchema } from "@nujum/shared";
import { Mic2 } from "lucide-react";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveJtcConfig } from "../app/actions/config";
import type { JtcConfigInput } from "../lib/data";
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

export function JtcConfigForm({
  guildId,
  defaults,
}: {
  guildId: string;
  defaults: JtcConfigInput;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<JtcConfigInput>({
    resolver: zodResolver(jtcConfigSchema),
    defaultValues: defaults,
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await saveJtcConfig(guildId, values);
      if (result.ok) {
        toast.success("Join-to-create settings saved", {
          description: `Config version ${result.data.version} · ${result.data.changed.length} field(s) changed`,
        });
      } else {
        toast.error("Could not save join-to-create settings", { description: result.error });
      }
    });
  });

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic2 className="h-4 w-4 text-primary" /> Voice room generator
          </CardTitle>
          <CardDescription>
            Members join a generator channel and get a private voice room of their own.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Toggle
                label="Enable join-to-create"
                description="Create a room whenever a member joins the generator."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <div>
            <Label htmlFor="jtc-name-template">Room name template</Label>
            <Input id="jtc-name-template" {...register("nameTemplate")} />
            <FieldError message={errors.nameTemplate?.message} />
          </div>
          <div>
            <Label htmlFor="generator-channel">Generator channel id</Label>
            <Input
              id="generator-channel"
              placeholder="123456789012345678"
              {...register("generatorChannelId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.generatorChannelId?.message} />
          </div>
          <div>
            <Label htmlFor="jtc-category">Discord category id</Label>
            <Input
              id="jtc-category"
              placeholder="123456789012345678"
              {...register("categoryId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.categoryId?.message} />
          </div>
          <div>
            <Label htmlFor="jtc-panel-channel">Panel channel id</Label>
            <Input
              id="jtc-panel-channel"
              placeholder="123456789012345678"
              {...register("panelChannelId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.panelChannelId?.message} />
          </div>
          <div>
            <Label htmlFor="interface-channel">Control panel channel id</Label>
            <Input
              id="interface-channel"
              placeholder="123456789012345678"
              {...register("interfaceChannelId", { setValueAs: optionalId })}
            />
            <FieldError message={errors.interfaceChannelId?.message} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defaults &amp; trusted roles</CardTitle>
          <CardDescription>
            Bitrate is in kbps; 0 user limit means unlimited. Leave region empty for automatic.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="default-limit">User limit</Label>
            <Input
              id="default-limit"
              type="number"
              {...register("defaultLimit", { valueAsNumber: true })}
            />
            <FieldError message={errors.defaultLimit?.message} />
          </div>
          <div>
            <Label htmlFor="default-bitrate">Bitrate (kbps)</Label>
            <Input
              id="default-bitrate"
              type="number"
              {...register("defaultBitrate", { valueAsNumber: true })}
            />
            <FieldError message={errors.defaultBitrate?.message} />
          </div>
          <div>
            <Label htmlFor="default-region">Voice region</Label>
            <Input
              id="default-region"
              placeholder="auto"
              {...register("defaultRegion", { setValueAs: optionalId })}
            />
            <FieldError message={errors.defaultRegion?.message} />
          </div>
          <div>
            <Label htmlFor="trusted-roles">Trusted role ids</Label>
            <Controller
              control={control}
              name="trustedRoleIds"
              render={({ field }) => (
                <Textarea
                  id="trusted-roles"
                  defaultValue={field.value.join(", ")}
                  onChange={(event) => field.onChange(splitList(event.target.value))}
                  placeholder="123456789012345678, 987654321098765432"
                />
              )}
            />
            <FieldError message={errors.trustedRoleIds?.message} />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border bg-surface/95 p-4 backdrop-blur">
        <p className="text-xs text-muted">
          Saving bumps the config version and notifies every connected bot process.
        </p>
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? "Saving…" : "Save join-to-create settings"}
        </Button>
      </div>
    </form>
  );
}
