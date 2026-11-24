"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PUNISHMENTS, securityConfigSchema, type SecurityConfigInput } from "@nujum/shared";
import { ShieldCheck } from "lucide-react";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveSecurityConfig } from "../app/actions/config";
import { Button } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { FieldError, Input, Label, Select, Textarea, Toggle } from "./ui/form";

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function SecurityForm({
  guildId,
  defaults,
}: {
  guildId: string;
  defaults: SecurityConfigInput;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SecurityConfigInput>({
    resolver: zodResolver(securityConfigSchema),
    defaultValues: defaults,
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await saveSecurityConfig(guildId, values);
      if (result.ok) {
        toast.success("Security settings saved", {
          description: `Config version ${result.data.version} · ${result.data.changed.length} field(s) changed`,
        });
      } else {
        toast.error("Could not save settings", { description: result.error });
      }
    });
  });

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Anti-raid
          </CardTitle>
          <CardDescription>
            A raid response only punishes young accounts when the join threshold is crossed.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="antiRaidEnabled"
            render={({ field }) => (
              <Toggle
                label="Enable anti-raid"
                description="Detect bursts of new, young accounts."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="autoLockdown"
            render={({ field }) => (
              <Toggle
                label="Automatic lockdown"
                description="Lock channels when a raid is confirmed."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <div>
            <Label htmlFor="raidJoinThreshold">Join threshold</Label>
            <Input
              id="raidJoinThreshold"
              type="number"
              {...register("raidJoinThreshold", { valueAsNumber: true })}
            />
            <FieldError message={errors.raidJoinThreshold?.message} />
          </div>
          <div>
            <Label htmlFor="raidWindowSeconds">Window (seconds)</Label>
            <Input
              id="raidWindowSeconds"
              type="number"
              {...register("raidWindowSeconds", { valueAsNumber: true })}
            />
            <FieldError message={errors.raidWindowSeconds?.message} />
          </div>
          <div>
            <Label htmlFor="raidMinAccountAgeDays">Minimum account age (days)</Label>
            <Input
              id="raidMinAccountAgeDays"
              type="number"
              {...register("raidMinAccountAgeDays", { valueAsNumber: true })}
            />
            <FieldError message={errors.raidMinAccountAgeDays?.message} />
          </div>
          <div>
            <Label htmlFor="raidAction">Raid action</Label>
            <Controller
              control={control}
              name="raidAction"
              render={({ field }) => (
                <Select id="raidAction" {...field}>
                  {PUNISHMENTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              )}
            />
            <FieldError message={errors.raidAction?.message} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anti-nuke &amp; anti-spam</CardTitle>
          <CardDescription>
            Protect channels, roles and conversation flow without exempting staff.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="antiNukeEnabled"
            render={({ field }) => (
              <Toggle label="Enable anti-nuke" checked={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="antiSpamEnabled"
            render={({ field }) => (
              <Toggle label="Enable anti-spam" checked={field.value} onChange={field.onChange} />
            )}
          />
          <div>
            <Label htmlFor="nukeThreshold">Nuke threshold</Label>
            <Input
              id="nukeThreshold"
              type="number"
              {...register("nukeThreshold", { valueAsNumber: true })}
            />
            <FieldError message={errors.nukeThreshold?.message} />
          </div>
          <div>
            <Label htmlFor="nukeWindowSeconds">Nuke window (seconds)</Label>
            <Input
              id="nukeWindowSeconds"
              type="number"
              {...register("nukeWindowSeconds", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="spamThreshold">Spam threshold</Label>
            <Input
              id="spamThreshold"
              type="number"
              {...register("spamThreshold", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="spamWindowSeconds">Spam window (seconds)</Label>
            <Input
              id="spamWindowSeconds"
              type="number"
              {...register("spamWindowSeconds", { valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="spamAction">Spam action</Label>
            <Controller
              control={control}
              name="spamAction"
              render={({ field }) => (
                <Select id="spamAction" {...field}>
                  {PUNISHMENTS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>
          <div>
            <Label htmlFor="mentionLimit">Mention limit</Label>
            <Input
              id="mentionLimit"
              type="number"
              {...register("mentionLimit", { valueAsNumber: true })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters &amp; alerts</CardTitle>
          <CardDescription>
            Allowed domains and invite codes are exact matches, never regex.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="inviteFilterEnabled"
            render={({ field }) => (
              <Toggle label="Invite filter" checked={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="linkFilterEnabled"
            render={({ field }) => (
              <Toggle label="Link filter" checked={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="phishingDetection"
            render={({ field }) => (
              <Toggle label="Phishing detection" checked={field.value} onChange={field.onChange} />
            )}
          />
          <div>
            <Label htmlFor="alertChannelId">Alert channel id</Label>
            <Input
              id="alertChannelId"
              placeholder="123456789012345678"
              {...register("alertChannelId")}
            />
            <FieldError message={errors.alertChannelId?.message} />
          </div>
          <Controller
            control={control}
            name="allowedDomains"
            render={({ field }) => (
              <div>
                <Label htmlFor="allowedDomains">Allowed domains</Label>
                <Textarea
                  id="allowedDomains"
                  defaultValue={field.value.join(", ")}
                  onChange={(event) => field.onChange(splitList(event.target.value))}
                  placeholder="example.com, docs.example.com"
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name="allowedInviteCodes"
            render={({ field }) => (
              <div>
                <Label htmlFor="allowedInviteCodes">Allowed invite codes</Label>
                <Textarea
                  id="allowedInviteCodes"
                  defaultValue={field.value.join(", ")}
                  onChange={(event) => field.onChange(splitList(event.target.value))}
                  placeholder="nujum"
                />
              </div>
            )}
          />
        </div>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border bg-surface/95 p-4 backdrop-blur">
        <p className="text-xs text-muted">
          Saving bumps the config version and notifies every connected bot process.
        </p>
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? "Saving…" : "Save security settings"}
        </Button>
      </div>
    </form>
  );
}
