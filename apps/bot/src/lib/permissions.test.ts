import { describe, expect, it } from "vitest";
import { PermissionsBitField } from "discord.js";
import { DISCORD_PERMISSIONS } from "@nujum/shared";
import { assertPermissionRegistry, permissionBits, toPermissionResolvable } from "./permissions";

describe("permission mapping", () => {
  it("maps every shared permission to a discord.js flag", () => {
    expect(() => assertPermissionRegistry()).not.toThrow();
  });

  it("builds bitfields from permission names", () => {
    const bits = permissionBits(["ViewChannel", "SendMessages"]);
    expect(bits).toBe(
      PermissionsBitField.Flags.ViewChannel | PermissionsBitField.Flags.SendMessages,
    );
    expect(permissionBits([])).toBe(0n);
  });

  it("returns resolvable values for discord.js APIs", () => {
    const resolved = toPermissionResolvable(["ManageGuild", "EmbedLinks"]);
    expect(resolved).toHaveLength(2);
    expect(permissionBits(["ManageGuild", "EmbedLinks"])).toBe(
      PermissionsBitField.Flags.ManageGuild | PermissionsBitField.Flags.EmbedLinks,
    );
  });

  it("covers the full Discord permission surface used by commands", () => {
    expect(DISCORD_PERMISSIONS.length).toBeGreaterThan(30);
  });
});
