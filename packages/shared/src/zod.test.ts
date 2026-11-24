import { describe, expect, it } from "vitest";
import {
  birthdaySchema,
  configImportSchema,
  embedSchema,
  generalSettingsSchema,
  hexColorSchema,
  keywordSchema,
  rolePanelInputSchema,
  securityConfigSchema,
  ticketActionSchema,
} from "./zod";

describe("common schemas", () => {
  it("normalizes colors to Discord integers", () => {
    expect(hexColorSchema.parse("#8B5CF6")).toBe(0x8b5cf6);
    expect(hexColorSchema.parse("8b5cf6")).toBe(0x8b5cf6);
    expect(hexColorSchema.parse(0x8b5cf6)).toBe(0x8b5cf6);
    expect(() => hexColorSchema.parse("nope")).toThrow();
  });

  it("validates timezones", () => {
    const valid = generalSettingsSchema.parse({
      locale: "en",
      brandColor: 0x8b5cf6,
      embedFooter: null,
      botNickname: "Nujum",
      timezone: "Europe/Amsterdam",
    });
    expect(valid.timezone).toBe("Europe/Amsterdam");

    expect(() =>
      generalSettingsSchema.parse({
        locale: "en",
        brandColor: 0x8b5cf6,
        embedFooter: null,
        botNickname: null,
        timezone: "Mars/Olympus_Mons",
      }),
    ).toThrow();
  });

  it("requires an embed to have content", () => {
    expect(embedSchema.parse({ description: "hello" }).description).toBe("hello");
    expect(() => embedSchema.parse({ color: 0xffffff })).toThrow();
    expect(() => embedSchema.parse({ description: "x".repeat(4097) })).toThrow();
  });
});

describe("security config", () => {
  const valid = {
    antiRaidEnabled: true,
    raidJoinThreshold: 10,
    raidWindowSeconds: 30,
    raidMinAccountAgeDays: 7,
    raidAction: "LOCKDOWN" as const,
    antiNukeEnabled: true,
    nukeThreshold: 3,
    nukeWindowSeconds: 60,
    antiSpamEnabled: true,
    spamThreshold: 7,
    spamWindowSeconds: 5,
    spamAction: "TIMEOUT" as const,
    mentionLimit: 5,
    inviteFilterEnabled: true,
    linkFilterEnabled: true,
    phishingDetection: true,
    allowedDomains: ["discord.com"],
    allowedInviteCodes: ["nujum"],
    alertChannelId: null,
    autoLockdown: true,
  };

  it("accepts a full config", () => {
    expect(securityConfigSchema.parse(valid).allowedDomains).toEqual(["discord.com"]);
  });

  it("rejects out-of-range thresholds", () => {
    expect(() => securityConfigSchema.parse({ ...valid, raidJoinThreshold: 1 })).toThrow();
  });

  it("normalizes pasted URLs to their host and rejects garbage", () => {
    const parsed = securityConfigSchema.parse({
      ...valid,
      allowedDomains: ["https://discord.com/channels/1"],
    });
    expect(parsed.allowedDomains).toEqual(["discord.com"]);
    expect(() =>
      securityConfigSchema.parse({ ...valid, allowedDomains: ["not a domain"] }),
    ).toThrow();
  });
});

describe("tickets", () => {
  it("requires a target user for ADD_USER", () => {
    expect(() => ticketActionSchema.parse({ action: "ADD_USER" })).toThrow();
    expect(
      ticketActionSchema.parse({ action: "ADD_USER", userId: "123456789012345678" }).userId,
    ).toBe("123456789012345678");
  });

  it("allows closing without a reason", () => {
    expect(ticketActionSchema.parse({ action: "CLOSE" }).action).toBe("CLOSE");
  });
});

describe("role panels", () => {
  const panel = {
    channelId: "123456789012345678",
    title: "Pick your roles",
    description: null,
    type: "BUTTONS" as const,
    mode: "TOGGLE" as const,
    maxRoles: 0,
    options: [
      { roleId: "123456789012345678", label: "Red", style: 1 },
      { roleId: "123456789012345679", label: "Blue", style: 2 },
    ],
  };

  it("accepts a valid panel", () => {
    expect(rolePanelInputSchema.parse(panel).options).toHaveLength(2);
  });

  it("rejects duplicate roles", () => {
    expect(() =>
      rolePanelInputSchema.parse({
        ...panel,
        options: [
          { roleId: "123456789012345678", label: "Red", style: 1 },
          { roleId: "123456789012345678", label: "Blue", style: 2 },
        ],
      }),
    ).toThrow();
  });
});

describe("extras", () => {
  it("rejects impossible birthdays", () => {
    expect(() =>
      birthdaySchema.parse({ month: 2, day: 30, year: 2000, timezone: "UTC" }),
    ).toThrow();
    expect(birthdaySchema.parse({ month: 2, day: 29, year: 2000, timezone: "UTC" }).day).toBe(29);
  });

  it("rejects invalid regex triggers", () => {
    expect(() =>
      keywordSchema.parse({ trigger: "([", matchType: "REGEX", response: "hi", enabled: true }),
    ).toThrow();
  });

  it("requires explicit confirmation for imports", () => {
    expect(() => configImportSchema.parse({ data: {}, mode: "merge" })).toThrow();
    expect(configImportSchema.parse({ data: {}, mode: "merge", confirm: true }).mode).toBe("merge");
  });
});
