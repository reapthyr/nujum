"use server";

import { signIn, signOut } from "../../auth";
import { SecurityError, toActionResult, type ActionResult } from "../../lib/http";

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function relativePath(value: string): string {
  if (!/^\/(?!\/)[^\r\n]{0,200}$/.test(value)) {
    throw new SecurityError("Invalid redirect path.", "BAD_REQUEST");
  }
  return value;
}

export async function reauthenticateAction(path: string): Promise<ActionResult> {
  try {
    const target = relativePath(path);
    // `max_age=0` forces Discord to verify the account again before returning.
    await signIn(
      "discord",
      { redirectTo: target, redirect: true },
      { prompt: "consent", max_age: "0" },
    );
    return { ok: true, data: undefined };
  } catch (error) {
    // NextAuth throws a redirect on success; that must propagate.
    if (isRedirect(error)) throw error;
    return toActionResult(error);
  }
}

export async function signOutAction(): Promise<ActionResult> {
  try {
    await signOut({ redirectTo: "/" });
    return { ok: true, data: undefined };
  } catch (error) {
    if (isRedirect(error)) throw error;
    return toActionResult(error);
  }
}
