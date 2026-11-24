/** Suppresses duplicate alerts for the same guild/actor/threat within a window. */
export class SecurityThrottle {
  private readonly seen = new Map<string, number>();

  constructor(private readonly maxKeys = 20_000) {}

  allow(key: string, now: number, windowMs = 30_000): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < windowMs) return false;

    this.seen.delete(key);
    this.seen.set(key, now);
    while (this.seen.size > this.maxKeys) {
      const oldest = this.seen.keys().next();
      if (oldest.done) return true;
      this.seen.delete(oldest.value);
    }
    return true;
  }

  reset(): void {
    this.seen.clear();
  }
}
