/**
 * Token-bucket rate limiting. Pure in-memory implementation used by the bot
 * (per user / per command / global) and by the dashboard when Upstash is not
 * configured. No timers, no background work: buckets are pruned lazily.
 */

export interface RateLimitOptions {
  /** Maximum burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until at least one token is available (0 when allowed). */
  retryAfterMs: number;
  resetAt: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const PRUNE_EVERY = 256;

export class TokenBucketLimiter {
  readonly capacity: number;
  readonly refillPerSecond: number;
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(options: RateLimitOptions) {
    if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
      throw new Error("RateLimitOptions.capacity must be a positive number");
    }
    if (!Number.isFinite(options.refillPerSecond) || options.refillPerSecond <= 0) {
      throw new Error("RateLimitOptions.refillPerSecond must be a positive number");
    }
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
  }

  consume(key: string, cost = 1, now = Date.now()): RateLimitResult {
    if (cost <= 0) throw new Error("Rate limit cost must be positive");
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
    const refilled = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);

    let allowed = false;
    let tokens = refilled;
    if (refilled >= cost) {
      tokens = refilled - cost;
      allowed = true;
    }

    this.buckets.set(key, { tokens, updatedAt: now });
    this.maybePrune(now);

    const missing = allowed ? 0 : cost - refilled;
    const retryAfterMs = allowed ? 0 : Math.ceil((missing / this.refillPerSecond) * 1000);
    return {
      allowed,
      limit: this.capacity,
      remaining: Math.floor(Math.max(0, tokens)),
      retryAfterMs,
      resetAt: now + retryAfterMs,
    };
  }

  /** Current tokens for a key without consuming (used by tests and diagnostics). */
  peek(key: string, now = Date.now()): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.capacity;
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
    return Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }

  get size(): number {
    return this.buckets.size;
  }

  private maybePrune(now: number): void {
    this.operations += 1;
    if (this.operations % PRUNE_EVERY !== 0) return;
    const idleMs = (this.capacity / this.refillPerSecond) * 1000 * 2;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > idleMs) this.buckets.delete(key);
    }
  }
}

export interface RateLimitRule extends RateLimitOptions {
  name: string;
}

export interface MultiRateLimitVerdict {
  allowed: boolean;
  /** The rule that rejected the request, if any. */
  blockedBy: string | null;
  retryAfterMs: number;
  results: Record<string, RateLimitResult>;
}

/**
 * Applies several independent limits to one action (e.g. per-user, per-guild,
 * global). All buckets are consumed even when one rejects, which prevents a
 * blocked caller from resetting their window by retrying immediately.
 */
export class MultiRateLimiter {
  private readonly limiters: ReadonlyMap<string, TokenBucketLimiter>;

  constructor(rules: readonly RateLimitRule[]) {
    if (rules.length === 0) throw new Error("MultiRateLimiter requires at least one rule");
    const limiters = new Map<string, TokenBucketLimiter>();
    for (const rule of rules) {
      if (limiters.has(rule.name)) throw new Error(`Duplicate rate limit rule: ${rule.name}`);
      limiters.set(rule.name, new TokenBucketLimiter(rule));
    }
    this.limiters = limiters;
  }

  consume(keyFor: (rule: string) => string, now = Date.now()): MultiRateLimitVerdict {
    const results: Record<string, RateLimitResult> = {};
    let blockedBy: string | null = null;
    let retryAfterMs = 0;

    for (const [name, limiter] of this.limiters) {
      const result = limiter.consume(keyFor(name), 1, now);
      results[name] = result;
      if (!result.allowed) {
        if (blockedBy === null || result.retryAfterMs > retryAfterMs) {
          blockedBy = name;
          retryAfterMs = result.retryAfterMs;
        }
      }
    }

    return { allowed: blockedBy === null, blockedBy, retryAfterMs, results };
  }

  reset(): void {
    for (const limiter of this.limiters.values()) limiter.reset();
  }
}
