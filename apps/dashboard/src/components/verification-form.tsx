"use client";

import {
  VERIFICATION_MODES,
  verificationConfigSchema,
  type VerificationConfigInput,
} from "@nujum/shared";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveVerificationConfig } from "../app/actions/config";
import { publishVerificationPanelAction } from "../app/actions/live";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { FieldError, Input, Label, Select, Textarea, Toggle } from "./ui/form";

type FormValues = Omit<VerificationConfigInput, "embed"> & { embedText: string };

function toFormValues(config: VerificationConfigInput): FormValues {
  return {
    ...config,
    embedText: config.embed ? JSON.stringify(config.embed, null, 2) : "",
  };
}

export function VerificationForm({
  guildId,
  config,
}: {
  guildId: string;
  config: VerificationConfigInput;
}) {
  const [pending, startTransition] = useTransition();
  const [publishing, setPublishing] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ defaultValues: toFormValues(config) });

  const submit = handleSubmit((values) => {
    let embed: unknown = null;
    if (values.embedText.trim()) {
      try {
        embed = JSON.parse(values.embedText) as unknown;
      } catch {
        setError("embedText", { message: "Embed must be valid JSON." });
        return;
      }
    }
    const payload = verificationConfigSchema.safeParse({
      enabled: values.enabled,
      mode: values.mode,
      channelId: values.channelId,
      roleId: values.roleId,
      minAccountAgeDays: values.minAccountAgeDays,
      message: values.message,
      embed,
      captchaProvider: values.captchaProvider,
    });
    if (!payload.success) {
      const first = payload.error.issues[0];
      if (first) setError(first.path.join(".") as keyof FormValues, { message: first.message });
      toast.error("Invalid verification settings", { description: first?.message });
      return;
    }
    startTransition(async () => {
      const result = await saveVerificationConfig(guildId, payload.data);
      if (result.ok) {
        toast.success("Verification settings saved", {
          description: `Config version ${result.data.version}`,
        });
      } else {
        toast.error("Could not save settings", { description: result.error });
      }
    });
  });

  function publish() {
    setPublishing(true);
    startTransition(async () => {
      const result = await publishVerificationPanelAction(guildId, {});
      if (result.ok) {
        toast.success(
          result.data.status === "QUEUED"
            ? "Panel queued for the bot"
            : "Verification panel published",
        );
      } else {
        toast.error("Could not publish panel", { description: result.error });
      }
      setPublishing(false);
    });
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Verification gate
          </CardTitle>
          <CardDescription>
            Codes are delivered by DM and stored as salted hashes. The panel is bound to this guild.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Toggle label="Enable verification" checked={field.value} onChange={field.onChange} />
            )}
          />
          <div>
            <Label htmlFor="mode">Mode</Label>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <Select id="mode" {...field}>
                  {VERIFICATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <Label htmlFor="channelId">Channel id</Label>
            <Input id="channelId" placeholder="123456789012345678" {...register("channelId")} />
            <FieldError message={errors.channelId?.message} />
          </div>
          <div>
            <Label htmlFor="roleId">Verified role id</Label>
            <Input id="roleId" placeholder="123456789012345678" {...register("roleId")} />
            <FieldError message={errors.roleId?.message} />
          </div>
          <div>
            <Label htmlFor="minAccountAgeDays">Minimum account age (days)</Label>
            <Input
              id="minAccountAgeDays"
              type="number"
              {...register("minAccountAgeDays", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="captchaProvider">Captcha provider</Label>
            <Input id="captchaProvider" placeholder="turnstile" {...register("captchaProvider")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="message">Panel message</Label>
            <Textarea id="message" {...register("message")} />
            <FieldError message={errors.message?.message} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="embedText">Embed JSON (optional)</Label>
            <Textarea id="embedText" className="font-mono text-xs" {...register("embedText")} />
            <FieldError message={errors.embedText?.message} />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface/95 p-4 backdrop-blur">
        <p className="text-xs text-muted">
          Publishing uses the signed Bot API; if offline, the panel is queued.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={publish} disabled={pending || publishing}>
            {publishing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Publish panel
          </Button>
          <Button type="submit" disabled={pending || !isDirty}>
            Save verification settings
          </Button>
        </div>
      </div>
    </form>
  );
}
