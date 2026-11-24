import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@nujum/shared";
import { CommandRateLimiter, CooldownStore } from "./cooldowns";

describe("CooldownStore", () => {
  it("starts, reports and expires cooldowns", () => {
    let now = 1_000;
    const store = new CooldownStore(() => now);
    expect(store.remaining("ping:1")).toBe(0);

    store.start("ping:1", 5_000);
    expect(store.remaining("ping:1")).toBe(5_000);

    now += 2_500;
    expect(store.remaining("ping:1")).toBe(2_500);

    now += 2_500;
    expect(store.remaining("ping:1")).toBe(0);
  });

  it("ignores non-positive durations and isolates keys", () => {
    const store = new CooldownStore(() => 0);
    store.start("a", 0);
    expect(store.remaining("a")).toBe(0);
    store.start("a", 1_000);
    store.start("b", 1_000);
    expect(store.remaining("a")).toBe(1_000);
    store.clear();
    expect(store.size).toBe(0);
  });
});

describe("CommandRateLimiter", () => {
  it("enforces the per-user limit and reports the blocking rule", () => {
    let now = 0;
    const limiter = new CommandRateLimiter(() => now);
    const definition = getCommandDefinition("ping");
    expect(definition).toBeDefined();
    if (!definition) return;

    for (let index = 0; index < definition.rateLimit.perUser; index += 1) {
      expect(limiter.check(definition, { userId: "1", guildId: "g" }).allowed).toBe(true);
    }

    const blocked = limiter.check(definition, { userId: "1", guildId: "g" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockedBy).toBe("user");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    now += definition.rateLimit.windowMs;
    expect(limiter.check(definition, { userId: "1", guildId: "g" }).allowed).toBe(true);
  });

  it("isolates users and guilds", () => {
    const limiter = new CommandRateLimiter(() => 0);
    const definition = getCommandDefinition("help");
    expect(definition).toBeDefined();
    if (!definition) return;

    // Exhaust user "a" in g1: the per-user budget follows the user everywhere.
    for (let index = 0; index < definition.rateLimit.perUser; index += 1) {
      limiter.check(definition, { userId: "a", guildId: "g1" });
    }
    expect(limiter.check(definition, { userId: "a", guildId: "g1" }).allowed).toBe(false);
    expect(limiter.check(definition, { userId: "a", guildId: "g2" }).allowed).toBe(false);

    // Another user is unaffected.
    expect(limiter.check(definition, { userId: "b", guildId: "g1" }).allowed).toBe(true);

    // Exhaust g3's guild budget with distinct users; the next user is blocked by "guild".
    for (let index = 0; index < definition.rateLimit.perGuild; index += 1) {
      const verdict = limiter.check(definition, { userId: `user-${index}`, guildId: "g3" });
      expect(verdict.allowed).toBe(true);
    }
    const guildBlocked = limiter.check(definition, { userId: "user-final", guildId: "g3" });
    expect(guildBlocked.allowed).toBe(false);
    expect(guildBlocked.blockedBy).toBe("guild");
  });
});
