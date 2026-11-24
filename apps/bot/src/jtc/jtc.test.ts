import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { JTC_DEFAULTS } from "@nujum/shared";
import { parseCustomId } from "../lib/components";
import type { BotLogger } from "../lib/logger";
import type { ModuleService } from "../lib/modules";
import { renderJtcName, sanitizeVoiceName } from "./naming";
import { PrismaJtcRepository } from "./repository";
import { JtcService } from "./service";
import type { JtcRepository, JtcRoomRecord, JtcSettings } from "./types";
import { DEFAULT_JTC_SETTINGS } from "./types";
import { canManageRoom, canTransferRoom, validateJtcAction, validateJtcPreset } from "./validation";
import type { JtcActor } from "./validation";
import { buildJtcPanelView } from "./views";

const GUILD = "123456789012345678";
const USER = "987654321098765432";
const logger = pino({ level: "silent" }) as unknown as BotLogger;

function actor(overrides: Partial<JtcActor> = {}): JtcActor {
  return {
    id: USER,
    roleIds: [],
    hasManageChannels: false,
    isGuildOwner: false,
    ...overrides,
  };
}

describe("JTC naming", () => {
  it("sanitizes display names and renders the configured template", () => {
    expect(sanitizeVoiceName("@#<Alice>\n_Bob_")).toBe("AliceBob");
    expect(renderJtcName(JTC_DEFAULTS.nameTemplate, "Alice")).toBe("Alice's Room");
  });
});

describe("JTC action validation", () => {
  it("accepts each required action family", () => {
    expect(validateJtcAction({ action: "LOCK" }).action).toBe("LOCK");
    expect(validateJtcAction({ action: "LIMIT", value: 10 }).action).toBe("LIMIT");
    expect(validateJtcAction({ action: "TRANSFER", userId: "111111111111111111" }).action).toBe(
      "TRANSFER",
    );
    expect(validateJtcPreset({ name: "gaming" }).userLimit).toBe(0);
  });

  it("rejects missing targets, out-of-range limits and invalid presets", () => {
    expect(() => validateJtcAction({ action: "KICK" })).toThrow();
    expect(() => validateJtcAction({ action: "LIMIT", value: 100 })).toThrow();
    expect(() => validateJtcAction({ action: "BITRATE", value: 4 })).toThrow();
    expect(() => validateJtcAction({ action: "REGION" })).toThrow();
    expect(() => validateJtcPreset({ name: "x".repeat(40) })).toThrow();
  });
});

describe("JTC ownership helpers", () => {
  const room = { ownerId: USER } as unknown as JtcRoomRecord;
  const settings = { trustedRoleIds: ["222222222222222222"] } as unknown as JtcSettings;

  it("allows owners, staff and trusted roles to manage a room", () => {
    expect(canManageRoom(room, settings, actor())).toBe(true);
    expect(
      canManageRoom(room, settings, actor({ id: "111111111111111111", hasManageChannels: true })),
    ).toBe(true);
    expect(
      canManageRoom(
        room,
        settings,
        actor({ id: "111111111111111111", roleIds: ["222222222222222222"] }),
      ),
    ).toBe(true);
  });

  it("denies unrelated members and restricts transfers to owner/staff", () => {
    const stranger = actor({ id: "111111111111111111" });
    expect(canManageRoom(room, settings, stranger)).toBe(false);
    expect(canTransferRoom(room, stranger)).toBe(false);
    expect(canTransferRoom(room, actor())).toBe(true);
    expect(canTransferRoom(room, actor({ id: "111111111111111111", isGuildOwner: true }))).toBe(
      true,
    );
  });
});

describe("JTC interface view", () => {
  it("emits guild-scoped control custom ids and a limit select", () => {
    const view = buildJtcPanelView(GUILD, USER, DEFAULT_JTC_SETTINGS);
    expect(view.components).toHaveLength(2);
    const buttons = view.components[0]?.toJSON() as unknown as {
      components: Array<{ custom_id: string }>;
    };
    const actions = buttons.components.map(
      (component) => parseCustomId(component.custom_id)?.action,
    );
    expect(actions).toEqual(["lock", "unlock", "hide", "unhide", "claim"]);
    const select = view.components[1]?.toJSON() as unknown as {
      components: Array<{ custom_id: string }>;
    };
    expect(parseCustomId(select.components[0]?.custom_id ?? "")?.action).toBe("limit");
  });
});

describe("JTC configuration service", () => {
  it("caches settings, invalidates per guild and falls back to shared defaults", async () => {
    let loaded: JtcSettings = { ...DEFAULT_JTC_SETTINGS, enabled: true, defaultLimit: 10 };
    let fail = false;
    const repository = {
      loadSettings: vi.fn(() =>
        fail ? Promise.reject(new Error("database offline")) : Promise.resolve(loaded),
      ),
    } as unknown as JtcRepository;
    const modules = { isEnabled: () => Promise.resolve(true) } as unknown as ModuleService;
    const service = new JtcService(
      repository,
      modules,
      vi.fn(() => Promise.resolve(undefined)),
      logger,
    );

    expect((await service.settings(GUILD)).defaultLimit).toBe(10);
    loaded = { ...loaded, defaultLimit: 20 };
    expect((await service.settings(GUILD)).defaultLimit).toBe(10);
    service.invalidate(GUILD);
    expect((await service.settings(GUILD)).defaultLimit).toBe(20);

    fail = true;
    service.invalidate(GUILD);
    const fallback = await service.settings(GUILD);
    expect(fallback.enabled).toBe(false);
    expect(fallback.nameTemplate).toBe(JTC_DEFAULTS.nameTemplate);
    expect(fallback.defaultBitrate).toBe(JTC_DEFAULTS.defaultBitrate);
  });

  it("wires the production repository to Prisma without eager connections", () => {
    expect(new PrismaJtcRepository()).toBeInstanceOf(PrismaJtcRepository);
  });
});
