"use client";

import type { ModuleKey } from "@nujum/shared";
import { useTransition } from "react";
import { toast } from "sonner";
import { saveModuleConfig } from "../app/actions/config";
import { Toggle } from "./ui/form";

export function ModuleToggle({
  guildId,
  moduleKey,
  label,
  description,
  enabled,
  settings,
}: {
  guildId: string;
  moduleKey: ModuleKey;
  label: string;
  description: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}) {
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    startTransition(async () => {
      const result = await saveModuleConfig(guildId, { key: moduleKey, enabled: next, settings });
      if (result.ok) {
        toast.success(`${label} ${next ? "enabled" : "disabled"}`, {
          description: `Config version ${result.data.version}`,
        });
      } else {
        toast.error(`Could not update ${label}`, { description: result.error });
      }
    });
  }

  return (
    <Toggle
      label={label}
      description={description}
      checked={enabled}
      disabled={pending}
      onChange={change}
    />
  );
}
