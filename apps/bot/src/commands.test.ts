import { describe, expect, it } from "vitest";
import { COMMANDS, getCommandDefinition } from "@nujum/shared";
import { command as security } from "./commands/configuration/security";
import { command as jtc } from "./commands/community/jtc";
import { command as panel } from "./commands/tickets/panel";
import { command as ticket } from "./commands/tickets/ticket";
import { command as botinfo } from "./commands/utility/botinfo";
import { command as help } from "./commands/utility/help";
import {
  command as invite,
  buildInviteUrl,
  requiredInvitePermissions,
} from "./commands/utility/invite";
import { command as ping } from "./commands/utility/ping";
import { command as support } from "./commands/utility/support";

const commands = [ping, help, botinfo, invite, support, security, ticket, panel, jtc];

describe("command manifest", () => {
  it("has unique names bound to shared definitions", () => {
    const names = commands.map((command) => command.definition.name);
    expect(new Set(names).size).toBe(names.length);
    for (const command of commands) {
      expect(getCommandDefinition(command.definition.name)).toBeDefined();
      expect(command.data.name).toBe(command.definition.name);
      expect(command.data.description).toBe(command.definition.description);
    }
  });

  it("produces valid Discord JSON", () => {
    for (const command of commands) {
      const json = command.data.toJSON();
      expect(json.name).toBe(command.definition.name);
      expect(json.name.length).toBeLessThanOrEqual(32);
      expect(json.description.length).toBeGreaterThan(0);
      expect(json.description.length).toBeLessThanOrEqual(100);
    }
  });

  it("only registers commands that exist in the shared registry", () => {
    const registered = new Set(commands.map((command) => command.definition.name));
    for (const name of registered) {
      expect(COMMANDS.some((definition) => definition.name === name)).toBe(true);
    }
  });

  it("never requests Administrator in the invite URL", () => {
    const permissions = requiredInvitePermissions();
    expect(permissions).toBeGreaterThan(0n);
    expect(permissions & 0x8n).toBe(0n); // Administrator bit
    const url = buildInviteUrl("123456789012345678");
    expect(url).toContain("client_id=123456789012345678");
    expect(url).toContain("scope=bot+applications.commands");
  });
});
