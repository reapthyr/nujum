import { describe, expect, it } from "vitest";
import { MultiRateLimiter, TokenBucketLimiter } from "./rate-limit";

describe("TokenBucketLimiter", () => {
  it("allows a burst up to capacity and then blocks", () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1 });
    expect(limiter.consume("user", 1, 0).allowed).toBe(true);
    expect(limiter.consume("user", 1, 0).allowed).toBe(true);
    const blocked = limiter.consume("user", 1, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1_000);
    expect(blocked.remaining).toBe(0);
  });

  it("refills over time", () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1 });
    limiter.consume("user", 2, 0);
    expect(limiter.consume("user", 1, 500).allowed).toBe(false);
    expect(limiter.consume("user", 1, 1_000).allowed).toBe(true);
  });

  it("isolates keys", () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0.1 });
    expect(limiter.consume("a", 1, 0).allowed).toBe(true);
    expect(limiter.consume("b", 1, 0).allowed).toBe(true);
    expect(limiter.consume("a", 1, 0).allowed).toBe(false);
  });

  it("validates configuration and cost", () => {
    expect(() => new TokenBucketLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0 })).toThrow();
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(() => limiter.consume("a", 0)).toThrow();
  });

  it("resets buckets", () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0.1 });
    limiter.consume("a", 1, 0);
    limiter.reset("a");
    expect(limiter.consume("a", 1, 0).allowed).toBe(true);
  });
});

describe("MultiRateLimiter", () => {
  it("blocks when any rule is exhausted and reports the longest retry", () => {
    const limiter = new MultiRateLimiter([
      { name: "user", capacity: 10, refillPerSecond: 1 },
      { name: "global", capacity: 2, refillPerSecond: 0.1 },
    ]);

    expect(limiter.consume(() => "shared", 0).allowed).toBe(true);
    expect(limiter.consume(() => "shared", 0).allowed).toBe(true);
    const blocked = limiter.consume(() => "shared", 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockedBy).toBe("global");
    expect(blocked.retryAfterMs).toBe(10_000);
    expect(blocked.results.user?.allowed).toBe(true);
  });

  it("rejects duplicate rule names", () => {
    expect(
      () =>
        new MultiRateLimiter([
          { name: "user", capacity: 1, refillPerSecond: 1 },
          { name: "user", capacity: 1, refillPerSecond: 1 },
        ]),
    ).toThrow();
  });
});
