import { describe, expect, it } from "vitest";
import {
  birthdaySchema,
  configImportSchema,
  embedSchema,
  generalSettingsSchema,
  hexColorSchema,
  jtcActionSchema,
  jtcConfigSchema,
  jtcPresetSchema,
  keywordSchema,
  publishTicketPanelBodySchema,
  queuedBotActionSchema,
  rolePanelInputSchema,
  securityConfigSchema,
  ticketActionSchema,
  ticketCategoryCreateInputSchema,
  ticketCategoryUpdateInputSchema,
  ticketConfigSchema,
  ticketPanelInputSchema,
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

  it("requires {number} in the channel naming format", () => {
    const base = {
      enabled: true,
      panelChannelId: null,
      transcriptChannelId: null,
      logChannelId: null,
      supportRoleIds: [],
      maxOpenPerUser: 1,
      inactivityHours: 48,
      warnBeforeHours: 6,
      ratingEnabled: true,
    };
    expect(
      ticketConfigSchema.parse({ ...base, namingFormat: "support-{number}" }).namingFormat,
    ).toBe("support-{number}");
    expect(() => ticketConfigSchema.parse({ ...base, namingFormat: "support" })).toThrow();
  });

  it("accepts cuid category ids and rejects duplicates", () => {
    const panel = {
      channelId: "123456789012345678",
      type: "BUTTONS" as const,
      embed: { title: "Support" },
      categoryIds: ["clh1234567890abcdefghi", "clh9876543210abcdefghi"],
    };
    expect(ticketPanelInputSchema.parse(panel).categoryIds).toHaveLength(2);
    expect(() =>
      ticketPanelInputSchema.parse({
        ...panel,
        categoryIds: [panel.categoryIds[0], panel.categoryIds[0]],
      }),
    ).toThrow();
  });

  it("rejects duplicate form field keys in create and update input", () => {
    const category = {
      name: "General",
      supportRoleIds: [],
      formFields: [
        { key: "topic", label: "Topic" },
        { key: "topic", label: "Topic again" },
      ],
    };
    expect(() => ticketCategoryCreateInputSchema.parse(category)).toThrow();
    expect(() =>
      ticketCategoryUpdateInputSchema.parse({
        ...category,
        id: "123456789012345678",
        formFields: [{ key: "topic", label: "Topic" }],
      }),
    ).not.toThrow();
  });
});

describe("join to create", () => {
  const config = {
    enabled: true,
    generatorChannelId: "123456789012345678",
    categoryId: "123456789012345679",
    nameTemplate: "{username}'s room",
    defaultLimit: 0,
    defaultBitrate: 64,
    defaultRegion: "auto",
    panelChannelId: null,
    interfaceChannelId: null,
    trustedRoleIds: [],
  };

  it("requires {username} in the room name template", () => {
    expect(jtcConfigSchema.parse(config).nameTemplate).toBe("{username}'s room");
    expect(() => jtcConfigSchema.parse({ ...config, nameTemplate: "My room" })).toThrow();
  });

  it("bounds presets and rejects invalid regions", () => {
    expect(jtcPresetSchema.parse({ name: "Quiet" }).bitrate).toBe(64);
    expect(() => jtcPresetSchema.parse({ name: "Bad", bitrate: 500 })).toThrow();
    expect(() => jtcPresetSchema.parse({ name: "Bad", region: "mars-1" })).toThrow();
  });

  it("requires a target for user actions and a value for numeric actions", () => {
    expect(() => jtcActionSchema.parse({ action: "KICK" })).toThrow();
    expect(() => jtcActionSchema.parse({ action: "LIMIT" })).toThrow();
    expect(jtcActionSchema.parse({ action: "LIMIT", value: 5 }).value).toBe(5);
  });
});

describe("dashboard live actions", () => {
  it("queues ticket panel publishing with a validated payload", () => {
    const body = publishTicketPanelBodySchema.parse({ channelId: "123456789012345678" });
    const queued = queuedBotActionSchema.parse({
      type: "PUBLISH_TICKET_PANEL",
      payload: body,
    });
    expect(queued.type).toBe("PUBLISH_TICKET_PANEL");
    expect(() =>
      queuedBotActionSchema.parse({
        type: "PUBLISH_TICKET_PANEL",
        payload: { channelId: "not-a-snowflake" },
      }),
    ).toThrow();
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
