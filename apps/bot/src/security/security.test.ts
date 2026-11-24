import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  AuditLogEvent,
  Collection,
  PermissionsBitField,
  type Guild,
  type GuildAuditLogsEntry,
} from "discord.js";
import { findAuditActor } from "../lib/audit-log";
import { detectEscalation } from "./escalation";
import { isExempt } from "./exemptions";
import { NukeDetector } from "./nuke";
import { hashVerificationCode, generateVerificationCode, verifyVerificationCode } from "./codes";
import { activateLockdown, deactivateLockdown } from "./lockdown";
import { RaidDetector } from "./raid";
import { GuildSecurityService } from "./service";
import { SpamDetector } from "./spam";
import { SecurityThrottle } from "./throttle";
import {
  DEFAULT_SECURITY_SETTINGS,
  EMPTY_WHITELIST,
  type AuditWrite,
  type LockdownRecord,
  type SecurityRepository,
  type SecuritySettings,
  type WhitelistSets,
} from "./types";
import { SlidingWindowCounter } from "./windows";
import {
  extractInviteCode,
  extractLinks,
  hostFromUrl,
  isHostAllowed,
  isOfficialDiscordHost,
  isPhishingHost,
  normalizeHost,
} from "./phishing";
import { ModuleService } from "../lib/modules";

const logger = pino({ level: "silent" });
const settings = (patch: Partial<SecuritySettings> = {}): SecuritySettings => ({
  ...DEFAULT_SECURITY_SETTINGS,
  ...patch,
});

describe("SlidingWindowCounter", () => {
  it("counts only hits inside the window", () => {
    const counter = new SlidingWindowCounter();
    expect(counter.hit("a", 1_000, 1_000)).toBe(1);
    expect(counter.hit("a", 1_500, 1_000)).toBe(2);
    expect(counter.count("a", 2_000, 1_000)).toBe(1);
    expect(counter.count("a", 2_600, 1_000)).toBe(0);
  });

  it("resets and prunes bounded state", () => {
    const counter = new SlidingWindowCounter(1);
    counter.hit("a", 1_000, 1_000);
    counter.hit("b", 1_000, 1_000);
    expect(counter.size).toBe(1);
    counter.reset();
    expect(counter.size).toBe(0);
    counter.hit("c", 1_000, 1_000);
    counter.prune(10_000_000);
    expect(counter.size).toBe(0);
  });
});

describe("RaidDetector", () => {
  it("triggers at the configured join threshold", () => {
    const detector = new RaidDetector();
    const config = settings({ raidJoinThreshold: 3, raidMinAccountAgeDays: 7 });
    let verdict = detector.record("g1", { userId: "1", accountCreatedAt: 0, now: 10_000 }, config);
    expect(verdict.triggered).toBe(false);
    verdict = detector.record("g1", { userId: "2", accountCreatedAt: 0, now: 10_100 }, config);
    expect(verdict.triggered).toBe(false);
    verdict = detector.record("g1", { userId: "3", accountCreatedAt: 0, now: 10_200 }, config);
    expect(verdict.triggered).toBe(true);
    expect(verdict.joins).toBe(3);
  });

  it("counts young accounts but never punishes a single one", () => {
    const detector = new RaidDetector();
    const config = settings({ raidJoinThreshold: 5, raidMinAccountAgeDays: 7 });
    const verdict = detector.record(
      "g1",
      { userId: "9", accountCreatedAt: Date.now() - 86_400_000, now: Date.now() },
      config,
    );
    expect(verdict.triggered).toBe(false);
    expect(verdict.youngAccountIds).toEqual(["9"]);
  });

  it("respects the enabled flag and the time window", () => {
    const detector = new RaidDetector();
    const config = settings({ antiRaidEnabled: false, raidJoinThreshold: 1 });
    expect(
      detector.record("g", { userId: "1", accountCreatedAt: 0, now: 1 }, config).triggered,
    ).toBe(false);
    const enabled = settings({ raidJoinThreshold: 2, raidWindowSeconds: 5 });
    detector.record("g", { userId: "1", accountCreatedAt: 0, now: 1_000 }, enabled);
    const verdict = detector.record("g", { userId: "2", accountCreatedAt: 0, now: 7_000 }, enabled);
    expect(verdict.joins).toBe(1);
  });
});

describe("NukeDetector", () => {
  it("counts per action type and per actor", () => {
    const detector = new NukeDetector();
    const config = settings({ nukeThreshold: 3, nukeWindowSeconds: 60 });
    detector.record("g", "a", "CHANNEL_DELETE", 1_000, config);
    detector.record("g", "a", "ROLE_DELETE", 1_100, config);
    const verdict = detector.record("g", "a", "CHANNEL_DELETE", 1_200, config);
    expect(verdict.count).toBe(2);
    expect(verdict.triggered).toBe(false);
    const third = detector.record("g", "a", "CHANNEL_DELETE", 1_300, config);
    expect(third.triggered).toBe(true);
    expect(third.type).toBe("MASS_CHANNEL_DELETE");
  });

  it("does not combine actors and honours the disabled flag", () => {
    const detector = new NukeDetector();
    const config = settings({ nukeThreshold: 2, antiNukeEnabled: false });
    detector.record("g", "a", "BAN", 1_000, config);
    expect(detector.record("g", "b", "BAN", 1_100, config).triggered).toBe(false);
  });
});

describe("escalation", () => {
  it("detects newly granted administrator", () => {
    const result = detectEscalation(0n, PermissionsBitField.Flags.Administrator);
    expect(result.administrator).toBe(true);
    expect(result.significant).toBe(true);
    expect(result.newlyGranted).toContain("Administrator");
  });

  it("ignores unchanged or benign permissions", () => {
    const result = detectEscalation(
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.EmbedLinks,
    );
    expect(result.significant).toBe(false);
  });
});

describe("phishing and links", () => {
  it("normalizes hosts and port", () => {
    expect(normalizeHost("HTTPS://WWW.Example.com.:443/path")).toBe("example.com");
  });

  it("flags known scam hosts and typosquats", () => {
    expect(isPhishingHost("discord-nitro.com")).toBe(true);
    expect(isPhishingHost("dlscord.gift")).toBe(true);
    expect(isPhishingHost("discord.com")).toBe(false);
    expect(isOfficialDiscordHost("sub.discord.gg")).toBe(true);
  });

  it("respects allowlists, including subdomains", () => {
    expect(isHostAllowed("cdn.example.com", ["example.com"])).toBe(true);
    expect(isHostAllowed("example.org", ["example.com"])).toBe(false);
    expect(hostFromUrl("https://example.com:8443/a")).toBe("example.com");
    expect(hostFromUrl("not a url")).toBeNull();
  });

  it("extracts links and invites", () => {
    expect(extractLinks("go https://example.com/x and www.foo.bar/y.")).toEqual([
      "https://example.com/x",
      "www.foo.bar/y",
    ]);
    expect(extractInviteCode("join https://discord.gg/AbC-123")).toBe("abc-123");
  });
});

describe("SpamDetector", () => {
  const signal = (content: string, mentionCount = 0, now = 1_000) => ({
    guildId: "g",
    channelId: "c",
    userId: "u",
    content,
    mentionCount,
    now,
  });

  it("classifies phishing before invites or links", () => {
    const detector = new SpamDetector();
    const verdict = detector.record(
      signal("https://discord-nitro.com/free join discord.gg/abc"),
      settings(),
      EMPTY_WHITELIST,
    );
    expect(verdict?.type).toBe("PHISHING");
    expect(verdict?.severity).toBe(3);
  });

  it("blocks unallowed invites and allows whitelisted codes", () => {
    const detector = new SpamDetector();
    const invites: WhitelistSets = { ...EMPTY_WHITELIST, invites: new Set(["abc"]) };
    expect(detector.record(signal("discord.gg/xyz"), settings(), invites)?.type).toBe("INVITE");
    expect(detector.record(signal("discord.gg/ABC"), settings(), invites)).toBeNull();
  });

  it("detects mention floods, duplicate floods and rate spam", () => {
    const detector = new SpamDetector();
    const config = settings({ spamThreshold: 3, spamWindowSeconds: 5, mentionLimit: 2 });
    expect(detector.record(signal("hello", 5), config, EMPTY_WHITELIST)?.type).toBe("MASS_MENTION");
    detector.record(signal("same message"), config, EMPTY_WHITELIST);
    detector.record(signal("same message", 0, 1_100), config, EMPTY_WHITELIST);
    const duplicate = detector.record(signal("same message", 0, 1_200), config, EMPTY_WHITELIST);
    expect(duplicate?.type).toBe("FLOOD");
    const rate = detector.record(signal("another", 0, 1_300), config, EMPTY_WHITELIST);
    expect(rate?.type).toBe("SPAM");
  });

  it("does not delete ordinary links without an explicit allowlist", () => {
    const detector = new SpamDetector();
    expect(detector.record(signal("https://example.com"), settings(), EMPTY_WHITELIST)).toBeNull();
    const strict = settings({ allowedDomains: ["trusted.com"] });
    expect(detector.record(signal("https://example.com"), strict, EMPTY_WHITELIST)?.type).toBe(
      "LINK",
    );
  });
});

describe("exemptions", () => {
  const context = {
    guildOwnerId: "owner",
    botUserId: "bot",
    ownerIds: new Set(["global"]),
    whitelist: EMPTY_WHITELIST,
  };

  it("exempts owners, the bot and whitelist entries", () => {
    expect(isExempt({ userId: "owner" }, context)).toBe(true);
    expect(isExempt({ userId: "bot" }, context)).toBe(true);
    expect(isExempt({ userId: "global" }, context)).toBe(true);
    const whitelist: WhitelistSets = {
      ...EMPTY_WHITELIST,
      users: new Set(["trusted"]),
      roles: new Set(["role"]),
      channels: new Set(["channel"]),
    };
    expect(isExempt({ userId: "trusted" }, { ...context, whitelist })).toBe(true);
    expect(isExempt({ userId: "x", roleIds: ["role"] }, { ...context, whitelist })).toBe(true);
    expect(isExempt({ userId: "x" }, { ...context, whitelist, channelId: "channel" })).toBe(true);
  });

  it("only exempts staff when explicitly requested", () => {
    const subject = { userId: "mod", staff: true };
    expect(isExempt(subject, context)).toBe(false);
    expect(isExempt(subject, { ...context, exemptStaff: true })).toBe(true);
  });
});

describe("SecurityThrottle", () => {
  it("suppresses duplicate alerts inside the window", () => {
    const throttle = new SecurityThrottle();
    expect(throttle.allow("g:raid", 1_000, 30_000)).toBe(true);
    expect(throttle.allow("g:raid", 2_000, 30_000)).toBe(false);
    expect(throttle.allow("g:raid", 31_000, 30_000)).toBe(true);
    expect(throttle.allow("g:nuke", 31_000, 30_000)).toBe(true);
  });
});

describe("verification codes", () => {
  it("generates 6 digits and verifies the hash", () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    const hash = hashVerificationCode(code, "salt");
    expect(verifyVerificationCode(code, hash)).toBe(true);
    expect(verifyVerificationCode("000000".startsWith(code) ? "111111" : "000000", hash)).toBe(
      false,
    );
    expect(verifyVerificationCode(code, "garbage")).toBe(false);
  });
});

describe("GuildSecurityService", () => {
  const emptyLockdown = {
    active: false,
    reason: null,
    activatedBy: null,
    activatedAt: null,
    snapshot: { channels: [] },
  };

  function repository(overrides: Partial<SecurityRepository> = {}): SecurityRepository {
    return {
      loadSettings: vi.fn(() => Promise.resolve(settings())),
      loadWhitelist: vi.fn(() => Promise.resolve(EMPTY_WHITELIST)),
      saveSettings: vi.fn(() => Promise.resolve()),
      loadLockdown: vi.fn(() => Promise.resolve(emptyLockdown)),
      saveLockdown: vi.fn(() => Promise.resolve()),
      createThreat: vi.fn(() => Promise.resolve()),
      createAudit: vi.fn(() => Promise.resolve()),
      addWhitelist: vi.fn(() => Promise.resolve()),
      removeWhitelist: vi.fn(() => Promise.resolve()),
      ...overrides,
    };
  }

  it("caches settings and reloads after invalidation", async () => {
    const loadSettings = vi.fn(() => Promise.resolve(settings()));
    const repo = repository({ loadSettings });
    const service = new GuildSecurityService(repo, logger);
    await service.settings("g");
    await service.settings("g");
    expect(loadSettings).toHaveBeenCalledTimes(1);
    service.invalidate("g");
    await service.settings("g");
    expect(loadSettings).toHaveBeenCalledTimes(2);
  });

  it("falls back to safe defaults when the database fails", async () => {
    const repo = repository({
      loadSettings: vi.fn(() => Promise.reject(new Error("db down"))),
    });
    const service = new GuildSecurityService(repo, logger);
    const snapshot = await service.snapshot("g");
    expect(snapshot.persisted).toBe(false);
    expect(snapshot.settings.antiRaidEnabled).toBe(true);
    expect(snapshot.settings.antiSpamEnabled).toBe(true);
  });

  it("shares concurrent loads for one guild", async () => {
    let resolve!: (value: SecuritySettings) => void;
    const loadSettings = vi.fn(
      () =>
        new Promise<SecuritySettings>((done) => {
          resolve = done;
        }),
    );
    const repo = repository({ loadSettings });
    const service = new GuildSecurityService(repo, logger);
    const first = service.settings("g");
    const second = service.settings("g");
    resolve(settings());
    await Promise.all([first, second]);
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });
});

describe("ModuleService", () => {
  it("uses registry defaults and explicit overrides", async () => {
    const service = new ModuleService(logger);
    // Empty cache entry exercises registry defaults without touching Prisma.
    service.seed("defaults", {});
    expect(await service.isEnabled("defaults", "SECURITY")).toBe(true);
    expect(await service.isEnabled("defaults", "VERIFICATION")).toBe(false);
    service.seed("g", { VERIFICATION: true, SECURITY: false });
    expect(await service.isEnabled("g", "VERIFICATION")).toBe(true);
    expect(await service.isEnabled("g", "SECURITY")).toBe(false);
    service.seed("other", { SECURITY: false });
    expect(await service.isEnabled("other", "SECURITY")).toBe(false);
    expect(await service.isEnabled("g", "SECURITY")).toBe(false);
  });
});

describe("lockdown", () => {
  interface FakeOverwrite {
    id: string;
    allow: { bitfield: bigint };
    deny: { bitfield: bigint };
  }

  function fixture() {
    const overwrites = new Map<string, FakeOverwrite>([
      ["everyone", { id: "everyone", allow: { bitfield: 1024n }, deny: { bitfield: 0n } }],
      ["role", { id: "role", allow: { bitfield: 2048n }, deny: { bitfield: 0n } }],
    ]);
    const edits: Array<{ id: string; options: Record<string, boolean | null> }> = [];
    const deletes: string[] = [];
    const audits: AuditWrite[] = [];
    let failRestore = false;
    let lockdown: LockdownRecord = {
      active: false,
      reason: null,
      activatedBy: null,
      activatedAt: null,
      snapshot: { channels: [] },
    };

    const channel = {
      id: "c",
      isThread: () => false,
      isTextBased: () => true,
      isVoiceBased: () => false,
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: {
        cache: overwrites,
        edit: (id: string, options: Record<string, boolean | null>) => {
          if (failRestore && id === "role") {
            return Promise.reject(new Error("Discord API unavailable"));
          }
          edits.push({ id, options });
          return Promise.resolve();
        },
        delete: (id: string) => {
          deletes.push(id);
          return Promise.resolve();
        },
      },
    };

    const guild = {
      id: "g",
      roles: { everyone: { id: "everyone" } },
      channels: { cache: new Map([["c", channel]]) },
      members: { me: { id: "bot" } },
      client: { user: { id: "bot" } },
    } as unknown as Guild;

    const service = {
      lockdown: () => Promise.resolve(lockdown),
      saveLockdown: (_guildId: string, record: LockdownRecord) => {
        lockdown = record;
        return Promise.resolve();
      },
      audit: (entry: AuditWrite) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as GuildSecurityService;

    return {
      guild,
      service,
      edits,
      deletes,
      audits,
      state: () => lockdown,
      setFailRestore: (value: boolean) => {
        failRestore = value;
      },
    };
  }

  it("denies explicit allow overwrites and restores the exact previous values", async () => {
    const f = fixture();
    const activated = await activateLockdown(f.guild, f.service, logger, {
      reason: "raid",
      activatedBy: "owner",
    });
    expect(activated.changed).toBe(1);
    expect(f.edits.map((entry) => entry.id)).toEqual(["everyone", "role"]);
    expect(f.state().snapshot.channels[0]?.overwrites?.map((entry) => entry.id)).toEqual([
      "everyone",
      "role",
    ]);

    const lifted = await deactivateLockdown(f.guild, f.service, logger, {
      reason: "manual",
      actorId: "owner",
    });
    expect(lifted.changed).toBe(2);
    expect(lifted.record.active).toBe(false);
    expect(f.deletes).toEqual([]);
    const restored = f.edits.slice(2);
    expect(restored[0]?.options.ViewChannel).toBe(true);
    expect(restored[1]?.options.SendMessages).toBe(true);
  });

  it("retains failed restores so a second attempt can finish the unlock", async () => {
    const f = fixture();
    await activateLockdown(f.guild, f.service, logger, { reason: "raid", activatedBy: "owner" });

    f.setFailRestore(true);
    const partial = await deactivateLockdown(f.guild, f.service, logger, {
      reason: "manual",
      actorId: "owner",
    });
    expect(partial.changed).toBe(1);
    expect(partial.record.active).toBe(true);
    expect(partial.record.snapshot.channels[0]?.overwrites?.map((entry) => entry.id)).toEqual([
      "role",
    ]);
    expect(f.audits.at(-1)?.action).toBe("security.lockdown.partial");

    f.setFailRestore(false);
    const final = await deactivateLockdown(f.guild, f.service, logger, {
      reason: "retry",
      actorId: "owner",
    });
    expect(final.changed).toBe(1);
    expect(final.record.active).toBe(false);
  });
});

describe("audit actor resolution", () => {
  it("supports an entry predicate for events without a single target id", async () => {
    const now = Date.now();
    const unrelated = {
      createdTimestamp: now,
      executorId: "wrong",
      targetId: "webhook-1",
      target: { channelId: "other-channel" },
    } as unknown as GuildAuditLogsEntry;
    const matching = {
      createdTimestamp: now,
      executorId: "right",
      targetId: "webhook-2",
      target: { channelId: "channel-1" },
    } as unknown as GuildAuditLogsEntry;
    const guild = {
      fetchAuditLogs: () =>
        Promise.resolve({
          entries: new Collection<string, GuildAuditLogsEntry>([
            ["unrelated", unrelated],
            ["matching", matching],
          ]),
        }),
    } as unknown as Guild;

    const actor = await findAuditActor({
      guild,
      type: AuditLogEvent.WebhookCreate,
      logger,
      matches: (entry) => {
        const target = entry.target as unknown as { channelId?: unknown } | null;
        return target?.channelId === "channel-1";
      },
    });
    expect(actor).toBe("right");
  });
});
