import { TokenBucketLimiter } from "@nujum/shared";

export interface ApiRateRule {
  capacity: number;
  windowMs: number;
}

/** Per-IP rules for the internal API. In-memory per process, like command limits. */
export const API_RATE_RULES = {
  authenticated: { capacity: 120, windowMs: 60_000 },
  authFailure: { capacity: 10, windowMs: 60_000 },
  mutation: { capacity: 30, windowMs: 60_000 },
  queueDrain: { capacity: 4, windowMs: 60_000 },
} as const satisfies Record<string, ApiRateRule>;

export interface ApiRateVerdict {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * One token bucket per rule, keyed internally by client IP. A brute-force
 * attempt burns the `authFailure` budget; valid traffic uses `authenticated`.
 */
export class ApiRateLimiter {
  private readonly buckets = new Map<string, TokenBucketLimiter>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(name: keyof typeof API_RATE_RULES, ip: string): ApiRateVerdict {
    const rule = API_RATE_RULES[name];
    let limiter = this.buckets.get(name);
    if (!limiter) {
      limiter = new TokenBucketLimiter({
        capacity: rule.capacity,
        refillPerSecond: rule.capacity / (rule.windowMs / 1000),
      });
      this.buckets.set(name, limiter);
    }
    const result = limiter.consume(ip, 1, this.now());
    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
  }
}
