/**
 * Bounded sliding-window counters used by the security detectors.
 *
 * Everything is in-memory and per process: shards do not share state, so a raid
 * split across shards is detected per shard. That is deliberate — cross-shard
 * coordination needs Redis/DB and is not worth the latency for rate detection.
 */
export class SlidingWindowCounter {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly maxKeys = 20_000) {}

  /** Records a hit and returns how many hits fall inside the window. */
  hit(key: string, now: number, windowMs: number): number {
    const cutoff = now - windowMs;
    const existing = this.buckets.get(key);
    const hits = existing ? existing.filter((at) => at > cutoff) : [];

    hits.push(now);
    // Cap per-key history so a single hot key cannot grow without bound.
    if (hits.length > 500) hits.splice(0, hits.length - 500);

    if (existing) this.buckets.delete(key);
    this.buckets.set(key, hits);
    this.evictIfNeeded();
    return hits.length;
  }

  count(key: string, now: number, windowMs: number): number {
    const hits = this.buckets.get(key);
    if (!hits) return 0;
    const cutoff = now - windowMs;
    return hits.reduce((total, at) => (at > cutoff ? total + 1 : total), 0);
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }

  /** Drops buckets whose newest hit is older than `olderThanMs`. */
  prune(now: number, olderThanMs = 3_600_000): void {
    for (const [key, hits] of this.buckets) {
      const last = hits[hits.length - 1];
      if (last === undefined || last <= now - olderThanMs) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  private evictIfNeeded(): void {
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) return;
      this.buckets.delete(oldest.value);
    }
  }
}
