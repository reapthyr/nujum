import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  DISCORD_PERMISSIONS,
  getCommandDefinition,
  hasDiscordPermissions,
  missingDiscordPermissions,
} from "./permissions";

const VALID_PERMISSIONS = new Set<string>(DISCORD_PERMISSIONS);

describe("command registry", () => {
  it("has unique command names", () => {
    const names = COMMANDS.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only references known Discord permissions", () => {
    for (const command of COMMANDS) {
      for (const permission of [...command.userPermissions, ...command.botPermissions]) {
        expect(VALID_PERMISSIONS.has(permission), `${command.name}: ${permission}`).toBe(true);
      }
    }
  });

  it("declares sane cooldowns and rate limits", () => {
    for (const command of COMMANDS) {
      expect(command.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(command.rateLimit.perUser).toBeGreaterThan(0);
      expect(command.rateLimit.perGuild).toBeGreaterThan(0);
      expect(command.rateLimit.global).toBeGreaterThan(0);
      expect(command.rateLimit.windowMs).toBeGreaterThan(0);
    }
  });

  it("looks commands up by name", () => {
    expect(getCommandDefinition("ban")?.userPermissions).toContain("BanMembers");
    expect(getCommandDefinition("does-not-exist")).toBeUndefined();
  });
});

describe("hasDiscordPermissions", () => {
  it("allows when no permission is required", () => {
    expect(hasDiscordPermissions(new Set(), [])).toBe(true);
  });

  it("requires every listed permission", () => {
    const member = new Set(["BanMembers"]);
    expect(hasDiscordPermissions(member, ["BanMembers"])).toBe(true);
    expect(hasDiscordPermissions(member, ["BanMembers", "ManageGuild"])).toBe(false);
    expect(missingDiscordPermissions(member, ["BanMembers", "ManageGuild"])).toEqual([
      "ManageGuild",
    ]);
  });

  it("lets Administrator bypass checks", () => {
    const member = new Set(["Administrator"]);
    expect(hasDiscordPermissions(member, ["BanMembers", "ManageGuild"])).toBe(true);
    expect(missingDiscordPermissions(member, ["BanMembers"])).toEqual([]);
  });
});
