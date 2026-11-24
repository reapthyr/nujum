import type { CommandDefinition } from "@nujum/shared";
import { MultiRateLimiter } from "@nujum/shared";

/** Per-user cooldowns for slash commands. In-memory and per shard by design. */
export class CooldownStore {
  private readonly entries = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Milliseconds left before the key may be used again (0 when ready). */
  remaining(key: string): number {
    this.prune();
    const expiresAt = this.entries.get(key);
    if (expiresAt === undefined) return 0;
    const remaining = expiresAt - this.now();
    if (remaining <= 0) {
      this.entries.delete(key);
      return 0;
    }
    return remaining;
  }

  start(key: string, durationMs: number): void {
    if (durationMs <= 0) return;
    this.entries.set(key, this.now() + durationMs);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(): void {
    if (this.entries.size < 512) return;
    const now = this.now();
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(key);
    }
  }
}

export interface RateLimitContext {
  userId: string;
  guildId: string | null;
}

export interface RateLimitVerdict {
  allowed: boolean;
  blockedBy: string | null;
  retryAfterMs: number;
}

/**
 * Applies the shared command rate limit (per user, per guild, global) using
 * one token-bucket set per command. State is per process, which is correct for
 * sharding: each shard owns its own guild set.
 */
export class CommandRateLimiter {
  private readonly limiters = new Map<string, MultiRateLimiter>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(definition: CommandDefinition, context: RateLimitContext): RateLimitVerdict {
    const limiter = this.limiterFor(definition);
    const verdict = limiter.consume((rule) => {
      switch (rule) {
        case "user":
          return `u:${context.userId}`;
        case "guild":
          return `g:${context.guildId ?? "dm"}`;
        case "global":
          return "global";
        default:
          return `unknown:${rule}`;
      }
    }, this.now());

    return {
      allowed: verdict.allowed,
      blockedBy: verdict.blockedBy,
      retryAfterMs: verdict.retryAfterMs,
    };
  }

  reset(): void {
    for (const limiter of this.limiters.values()) limiter.reset();
  }

  private limiterFor(definition: CommandDefinition): MultiRateLimiter {
    const existing = this.limiters.get(definition.name);
    if (existing) return existing;

    const windowSeconds = definition.rateLimit.windowMs / 1000;
    const created = new MultiRateLimiter([
      {
        name: "user",
        capacity: definition.rateLimit.perUser,
        refillPerSecond: definition.rateLimit.perUser / windowSeconds,
      },
      {
        name: "guild",
        capacity: definition.rateLimit.perGuild,
        refillPerSecond: definition.rateLimit.perGuild / windowSeconds,
      },
      {
        name: "global",
        capacity: definition.rateLimit.global,
        refillPerSecond: definition.rateLimit.global / windowSeconds,
      },
    ]);
    this.limiters.set(definition.name, created);
    return created;
  }
}
