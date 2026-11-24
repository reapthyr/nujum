import type { VerificationMode } from "@nujum/shared";

export interface VerificationSettings {
  enabled: boolean;
  mode: VerificationMode;
  channelId: string | null;
  roleId: string | null;
  minAccountAgeDays: number;
  message: string;
  captchaProvider: string | null;
}

export const DEFAULT_VERIFICATION_SETTINGS: Readonly<VerificationSettings> = Object.freeze({
  enabled: false,
  mode: "BUTTON",
  channelId: null,
  roleId: null,
  minAccountAgeDays: 7,
  message: "Click the button below to verify.",
  captchaProvider: null,
});

export type VerificationSessionStatus = "PENDING" | "VERIFIED" | "EXPIRED" | "FAILED";

export interface VerificationSessionState {
  status: VerificationSessionStatus;
  attempts: number;
  expiresAt: number;
  codeHash: string | null;
}

export type VerificationCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no-session" | "expired" | "verified" | "too-many-attempts" | "invalid-code";
      attemptsLeft: number;
    };

export const SESSION_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
