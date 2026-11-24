"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { reauthenticateAction, signOutAction } from "../app/actions/auth";
import { Button } from "./ui/button";

export function AccountMenu({ username, path }: { username: string; path: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function reauthenticate() {
    startTransition(async () => {
      const result = await reauthenticateAction(path);
      if (!result.ok) toast.error(result.error, { description: result.code });
    });
  }

  function signOut() {
    startTransition(async () => {
      const result = await signOutAction();
      if (!result.ok) {
        toast.error(result.error);
      } else {
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-xs font-medium">{username}</p>
        <p className="text-[11px] text-muted">Discord account</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        title="Reauthenticate"
        disabled={pending}
        onClick={reauthenticate}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Sign out"
        disabled={pending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          signOut();
        }}
      >
        <LogOut className="h-4 w-4" />
      </Button>
      {confirming ? <span className="sr-only">Click sign out again to confirm</span> : null}
    </div>
  );
}
