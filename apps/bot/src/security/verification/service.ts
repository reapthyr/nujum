import type { VerificationMode } from "@nujum/shared";
import { getPrisma } from "@nujum/shared/prisma";
import { serializeError } from "../../lib/errors";
import type { BotLogger } from "../../lib/logger";
import { generateVerificationCode, hashVerificationCode, verifyVerificationCode } from "../codes";
import {
  DEFAULT_VERIFICATION_SETTINGS,
  MAX_ATTEMPTS,
  SESSION_TTL_MS,
  type VerificationCheckResult,
  type VerificationSessionState,
  type VerificationSettings,
} from "./types";

interface CacheEntry {
  settings: VerificationSettings;
  expiresAt: number;
}

export interface BeginResult {
  code: string | null;
  state: VerificationSessionState;
}

/** Database-backed verification configuration and short-lived sessions. */
export class VerificationService {
  private readonly settingsCache = new Map<string, CacheEntry>();
  private readonly sessions = new Map<string, VerificationSessionState>();
  private readonly inflight = new Map<string, Promise<VerificationSettings>>();

  constructor(
    private readonly logger: BotLogger,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async settings(guildId: string): Promise<VerificationSettings> {
    const cached = this.settingsCache.get(guildId);
    if (cached && cached.expiresAt > this.now()) return cached.settings;

    const pending = this.inflight.get(guildId);
    if (pending) return pending;

    const load = this.loadSettings(guildId).finally(() => this.inflight.delete(guildId));
    this.inflight.set(guildId, load);
    return load;
  }

  invalidate(guildId?: string): void {
    if (guildId === undefined) {
      this.settingsCache.clear();
      this.sessions.clear();
      return;
    }
    this.settingsCache.delete(guildId);
    for (const key of this.sessions.keys()) {
      if (key.startsWith(`${guildId}:`)) this.sessions.delete(key);
    }
  }

  /** Seeds a session cache entry (used by tests). */
  seedSession(guildId: string, userId: string, state: VerificationSessionState): void {
    this.sessions.set(`${guildId}:${userId}`, state);
  }

  async saveSettings(
    guildId: string,
    patch: Partial<VerificationSettings>,
    actorId: string,
  ): Promise<VerificationSettings> {
    const data = { ...patch, updatedBy: actorId };
    await getPrisma().verificationConfig.upsert({
      where: { guildId },
      create: { guildId, ...DEFAULT_VERIFICATION_SETTINGS, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return this.settings(guildId);
  }

  /**
   * Starts (or restarts) a verification session. CAPTCHA mode returns the
   * plaintext code once, for delivery by DM; only its hash is cached/stored.
   */
  async begin(guildId: string, userId: string, mode: VerificationMode): Promise<BeginResult> {
    const code = mode === "CAPTCHA" ? generateVerificationCode() : null;
    const codeHash = code === null ? null : hashVerificationCode(code);
    const expiresAt = this.now() + SESSION_TTL_MS;
    const state: VerificationSessionState = {
      status: "PENDING",
      attempts: 0,
      expiresAt,
      codeHash,
    };

    try {
      await getPrisma().verificationSession.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: {
          guildId,
          userId,
          status: "PENDING",
          code: codeHash,
          attempts: 0,
          expiresAt: new Date(expiresAt),
        },
        update: {
          status: "PENDING",
          code: codeHash,
          attempts: 0,
          expiresAt: new Date(expiresAt),
        },
      });
    } catch (error) {
      this.logger.error(
        { err: serializeError(error), guildId, userId },
        "failed to create verification session",
      );
      throw error;
    }

    this.sessions.set(`${guildId}:${userId}`, state);
    return { code, state };
  }

  async session(guildId: string, userId: string): Promise<VerificationSessionState | null> {
    const key = `${guildId}:${userId}`;
    const cached = this.sessions.get(key);
    if (cached) return cached;

    try {
      const row = await getPrisma().verificationSession.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });
      if (!row) return null;
      const state: VerificationSessionState = {
        status: this.toStatus(row.status),
        attempts: row.attempts,
        expiresAt: row.expiresAt.getTime(),
        codeHash: row.code,
      };
      this.sessions.set(key, state);
      return state;
    } catch (error) {
      this.logger.warn(
        { err: serializeError(error), guildId, userId },
        "verification session lookup failed",
      );
      return null;
    }
  }

  async checkCode(guildId: string, userId: string, code: string): Promise<VerificationCheckResult> {
    const state = await this.session(guildId, userId);
    if (!state) return { ok: false, reason: "no-session", attemptsLeft: MAX_ATTEMPTS };
    if (state.status === "VERIFIED") return { ok: false, reason: "verified", attemptsLeft: 0 };
    if (state.expiresAt <= this.now() || state.status === "EXPIRED") {
      return { ok: false, reason: "expired", attemptsLeft: 0 };
    }
    if (state.attempts >= MAX_ATTEMPTS) {
      return { ok: false, reason: "too-many-attempts", attemptsLeft: 0 };
    }

    const valid =
      state.codeHash !== null &&
      /^\d{6}$/.test(code) &&
      verifyVerificationCode(code, state.codeHash);

    if (!valid) {
      const attempts = state.attempts + 1;
      await this.updateSession(guildId, userId, {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
      });
      return {
        ok: false,
        reason: "invalid-code",
        attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
      };
    }

    await this.updateSession(guildId, userId, { status: "VERIFIED", verifiedAt: new Date() });
    return { ok: true };
  }

  async markVerified(guildId: string, userId: string): Promise<void> {
    await this.updateSession(guildId, userId, { status: "VERIFIED", verifiedAt: new Date() });
  }

  private async updateSession(
    guildId: string,
    userId: string,
    patch: {
      status?: VerificationSessionState["status"];
      attempts?: number;
      verifiedAt?: Date;
    },
  ): Promise<void> {
    const key = `${guildId}:${userId}`;
    const current = this.sessions.get(key);
    if (current) {
      if (patch.status !== undefined) current.status = patch.status;
      if (patch.attempts !== undefined) current.attempts = patch.attempts;
    }

    // The database enum has no FAILED state; exhausted sessions are expired.
    const dbStatus = patch.status === "FAILED" ? "EXPIRED" : patch.status;

    try {
      await getPrisma().verificationSession.update({
        where: { guildId_userId: { guildId, userId } },
        data: {
          ...(dbStatus ? { status: dbStatus } : {}),
          ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
          ...(patch.verifiedAt ? { verifiedAt: patch.verifiedAt } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        { err: serializeError(error), guildId, userId },
        "failed to update verification session",
      );
    }
  }

  private async loadSettings(guildId: string): Promise<VerificationSettings> {
    try {
      const row = await getPrisma().verificationConfig.findUnique({ where: { guildId } });
      const settings: VerificationSettings = row
        ? {
            enabled: row.enabled,
            mode: row.mode,
            channelId: row.channelId,
            roleId: row.roleId,
            minAccountAgeDays: row.minAccountAgeDays,
            message: row.message,
            captchaProvider: row.captchaProvider,
          }
        : { ...DEFAULT_VERIFICATION_SETTINGS };
      this.store(guildId, settings, this.ttlMs);
      return settings;
    } catch (error) {
      this.logger.warn(
        { err: serializeError(error), guildId },
        "verification config unavailable; using safe defaults",
      );
      const settings = { ...DEFAULT_VERIFICATION_SETTINGS };
      this.store(guildId, settings, 5_000);
      return settings;
    }
  }

  private store(guildId: string, settings: VerificationSettings, ttlMs: number): void {
    this.settingsCache.set(guildId, { settings, expiresAt: this.now() + ttlMs });
  }

  private toStatus(value: string): VerificationSessionState["status"] {
    return value === "VERIFIED" || value === "EXPIRED" || value === "FAILED" ? value : "PENDING";
  }
}
