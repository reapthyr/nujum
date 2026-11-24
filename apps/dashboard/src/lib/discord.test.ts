import { describe, expect, it } from "vitest";
import {
  assertGuildAccess,
  canManageGuild,
  isSuperAdmin,
  parsePermissionBits,
  type DiscordGuildSummary,
} from "./discord";
import { SecurityError } from "./http";

const guild: DiscordGuildSummary = {
  id: "123456789012345678",
  name: "Example",
  icon: null,
  owner: false,
  ownerId: "987654321098765432",
  permissions: "0",
};

describe("Discord authorization", () => {
  it("recognizes owner and super-admin roles", () => {
    expect(assertGuildAccess(guild, "987654321098765432", [])).toBe("OWNER");
    expect(assertGuildAccess(guild, "111111111111111111", ["111111111111111111"])).toBe(
      "SUPER_ADMIN",
    );
  });

  it("accepts Administrator and Manage Server bits only", () => {
    expect(canManageGuild(parsePermissionBits("8"), false)).toBe(true);
    expect(canManageGuild(parsePermissionBits("32"), false)).toBe(true);
    expect(canManageGuild(parsePermissionBits("1024"), false)).toBe(false);
    expect(parsePermissionBits("not-a-number")).toBe(0n);
    expect(() => assertGuildAccess(guild, "111111111111111111", [])).toThrow(SecurityError);
  });

  it("treats configured owner ids as an exact match", () => {
    expect(isSuperAdmin("123456789012345678", ["1234567890123456789"])).toBe(false);
    expect(isSuperAdmin("123456789012345678", ["123456789012345678"])).toBe(true);
  });
});
