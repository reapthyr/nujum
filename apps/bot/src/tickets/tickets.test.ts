import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { TICKET_DEFAULTS } from "@nujum/shared";
import type { BotLogger } from "../lib/logger";
import type { ModuleService } from "../lib/modules";
import { parseCustomId } from "../lib/components";
import { formatTicketName } from "./naming";
import { PrismaTicketRepository } from "./repository";
import { TicketService } from "./service";
import { buildTranscriptHtml } from "./transcript";
import type { TicketCategoryRecord, TicketRepository, TicketSettings } from "./types";
import { DEFAULT_TICKET_SETTINGS } from "./types";
import { parseTicketPanelInput } from "./validation";
import { buildTicketPanelView } from "./views";

const GUILD = "123456789012345678";
const USER = "987654321098765432";
const logger = pino({ level: "silent" }) as unknown as BotLogger;

function category(index: number): TicketCategoryRecord {
  return {
    id: `category-${index}`,
    guildId: GUILD,
    name: `Category ${index}`,
    emoji: null,
    description: `Description ${index}`,
    discordCategoryId: null,
    supportRoleIds: [],
    formFields: [],
    position: index,
    enabled: true,
  };
}

describe("ticket naming", () => {
  it("renders the shared default format", () => {
    expect(formatTicketName(TICKET_DEFAULTS.namingFormat, 42)).toBe("ticket-42");
  });

  it("rejects unsafe or placeholder-less formats", () => {
    expect(() => formatTicketName("ticket", 1)).toThrow();
    expect(() => formatTicketName("Ticket {number}", 1)).toThrow();
    expect(() => formatTicketName("ticket-{number}", 0)).toThrow();
  });
});

describe("ticket panel view", () => {
  it("caps button rows at five and encodes guild-scoped custom ids", () => {
    const view = buildTicketPanelView(
      { guildId: GUILD, type: "BUTTONS", embed: { title: "Support" } },
      Array.from({ length: 12 }, (_, index) => category(index + 1)),
      USER,
    );
    expect(view.components).toHaveLength(3);
    const firstRow = view.components[0]?.toJSON() as unknown as {
      components: Array<{ custom_id: string }>;
    };
    expect(firstRow.components).toHaveLength(5);
    const parsed = parseCustomId(firstRow.components[0]?.custom_id ?? "");
    expect(parsed?.module).toBe("ticket");
    expect(parsed?.action).toBe("start");
    expect(parsed?.guildId).toBe(GUILD);
    expect(parsed?.args[0]).toBe("category-1");
  });

  it("uses category ids as select values for dropdown panels", () => {
    const view = buildTicketPanelView(
      { guildId: GUILD, type: "DROPDOWN", embed: {} },
      [category(1), category(2)],
      USER,
    );
    const row = view.components[0]?.toJSON() as unknown as {
      components: Array<{ options: Array<{ value: string }> }>;
    };
    expect(row.components[0]?.options.map((option) => option.value)).toEqual([
      "category-1",
      "category-2",
    ]);
  });

  it("refuses to publish a panel with no enabled categories", () => {
    expect(() =>
      buildTicketPanelView({ guildId: GUILD, type: "BUTTONS", embed: {} }, [], USER),
    ).toThrow();
  });
});

describe("ticket panel input contract", () => {
  it("accepts opaque category ids through the shared contract", () => {
    const snowflakes = parseTicketPanelInput({
      channelId: GUILD,
      type: "BUTTONS",
      embed: { title: "Support" },
      categoryIds: ["111111111111111111"],
    });
    expect(snowflakes.categoryIds).toEqual(["111111111111111111"]);

    const cuids = parseTicketPanelInput({
      channelId: GUILD,
      type: "DROPDOWN",
      embed: { title: "Support" },
      categoryIds: ["clh1234567890123456789"],
    });
    expect(cuids.categoryIds).toEqual(["clh1234567890123456789"]);
  });
});

describe("transcript", () => {
  it("escapes content and stays within the shared byte budget", () => {
    const result = buildTranscriptHtml(
      [
        {
          authorTag: "<@evil>",
          content: "<script>alert(1)</script>",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      700,
    );
    expect(result.messageCount).toBe(1);
    expect(result.sizeBytes).toBeLessThanOrEqual(700);
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
  });

  it("enforces the byte budget for multibyte content", () => {
    const result = buildTranscriptHtml(
      Array.from({ length: 40 }, (_, index) => ({
        authorTag: "مستخدم",
        content: "رسالة طويلة 💬 ".repeat(20),
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
      900,
    );
    expect(result.sizeBytes).toBeLessThanOrEqual(900);
    expect(Buffer.byteLength(result.html, "utf8")).toBeLessThanOrEqual(900);
  });
});

describe("ticket configuration service", () => {
  it("caches settings, invalidates per guild and degrades safely on DB failure", async () => {
    let loaded: TicketSettings = { ...DEFAULT_TICKET_SETTINGS, enabled: true, maxOpenPerUser: 3 };
    let fail = false;
    const loadSettings = vi.fn(() =>
      fail ? Promise.reject(new Error("database offline")) : Promise.resolve(loaded),
    );
    const repository = {
      loadSettings,
      loadCategories: () => Promise.resolve([category(1)]),
      loadPanel: () => Promise.resolve(null),
    } as unknown as TicketRepository;
    const modules = { isEnabled: () => Promise.resolve(true) } as unknown as ModuleService;
    const service = new TicketService(
      repository,
      modules,
      vi.fn(() => Promise.resolve(undefined)),
      logger,
    );

    expect((await service.settings(GUILD)).maxOpenPerUser).toBe(3);
    loaded = { ...loaded, maxOpenPerUser: 5 };
    expect((await service.settings(GUILD)).maxOpenPerUser).toBe(3);
    service.invalidate(GUILD);
    expect((await service.settings(GUILD)).maxOpenPerUser).toBe(5);

    fail = true;
    service.invalidate(GUILD);
    const fallback = await service.settings(GUILD);
    expect(fallback.enabled).toBe(false);
    expect(fallback.namingFormat).toBe(TICKET_DEFAULTS.namingFormat);
    expect(fallback.maxOpenPerUser).toBe(TICKET_DEFAULTS.maxOpenPerUser);
  });

  it("wires the production repository to Prisma without eager connections", () => {
    expect(new PrismaTicketRepository()).toBeInstanceOf(PrismaTicketRepository);
  });
});
