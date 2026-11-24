import { describe, expect, it } from "vitest";
import { buildCustomId, isCustomIdOwner, matchesRoute, parseCustomId } from "./components";

const GUILD = "123456789012345678";
const USER = "987654321098765432";

describe("buildCustomId", () => {
  it("encodes guild and user", () => {
    const id = buildCustomId({ module: "help", action: "refresh", guildId: GUILD, userId: USER });
    expect(id).toBe(`nujum:help:refresh:g${GUILD}:${USER}`);
  });

  it("encodes DM scope", () => {
    const id = buildCustomId({ module: "help", action: "refresh", guildId: null, userId: USER });
    expect(id).toBe(`nujum:help:refresh:d:${USER}`);
  });

  it("round-trips arguments safely", () => {
    const id = buildCustomId({
      module: "ticket",
      action: "close",
      guildId: GUILD,
      userId: USER,
      args: ["abc:def", 42],
    });
    const parsed = parseCustomId(id);
    expect(parsed?.args).toEqual(["abc:def", "42"]);
  });

  it("rejects identifiers that would exceed the Discord limit", () => {
    expect(() =>
      buildCustomId({
        module: "help",
        action: "refresh",
        guildId: GUILD,
        userId: USER,
        args: Array.from({ length: 10 }, () => "x".repeat(20)),
      }),
    ).toThrow();
  });

  it("rejects invalid module tokens", () => {
    expect(() =>
      buildCustomId({ module: "help me", action: "refresh", guildId: GUILD, userId: USER }),
    ).toThrow();
  });
});

describe("parseCustomId", () => {
  it("rejects foreign namespaces and malformed ids", () => {
    expect(parseCustomId("other:help:refresh:d:123456789012345678")).toBeNull();
    expect(parseCustomId("nujum:help:refresh:d:not-a-snowflake")).toBeNull();
    expect(parseCustomId("nujum:help:refresh:x:123456789012345678")).toBeNull();
    expect(parseCustomId("nujum:help")).toBeNull();
    expect(parseCustomId("x".repeat(101))).toBeNull();
  });

  it("normalizes case for routing", () => {
    const parsed = parseCustomId(`nujum:HELP:Refresh:d:${USER}`);
    expect(parsed?.module).toBe("help");
    expect(parsed?.action).toBe("refresh");
  });

  it("decodes percent-encoded arguments", () => {
    const parsed = parseCustomId(`nujum:help:refresh:d:${USER}:hello%20world`);
    expect(parsed?.args).toEqual(["hello world"]);
  });
});

describe("ownership", () => {
  const parsed = parseCustomId(`nujum:help:refresh:g${GUILD}:${USER}`);

  it("accepts the original user in the original guild", () => {
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(isCustomIdOwner(parsed, { userId: USER, guildId: GUILD })).toBe(true);
  });

  it("rejects another user", () => {
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(isCustomIdOwner(parsed, { userId: "111111111111111111", guildId: GUILD })).toBe(false);
  });

  it("rejects the same user in another guild", () => {
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(isCustomIdOwner(parsed, { userId: USER, guildId: "111111111111111111" })).toBe(false);
  });

  it("matches routes by module and action", () => {
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(matchesRoute(parsed, { module: "help", action: "refresh" })).toBe(true);
    expect(matchesRoute(parsed, { module: "help", action: "close" })).toBe(false);
  });
});
