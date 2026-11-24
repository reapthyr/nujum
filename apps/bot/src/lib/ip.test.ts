import { describe, expect, it } from "vitest";
import { ipMatchesCidr, isIpAllowed, parseCidr, parseIp } from "./ip";

describe("parseIp", () => {
  it("parses IPv4", () => {
    expect(parseIp("127.0.0.1")).toEqual({ family: 4, value: 0x7f000001n });
    expect(parseIp("255.255.255.255")?.value).toBe(0xffffffffn);
    expect(parseIp("256.0.0.1")).toBeNull();
  });

  it("parses and expands IPv6", () => {
    expect(parseIp("::1")).toEqual({ family: 6, value: 1n });
    expect(parseIp("2001:db8::1")).not.toBeNull();
    expect(parseIp("::")).toEqual({ family: 6, value: 0n });
    expect(parseIp("2001:db8::zz")).toBeNull();
    expect(parseIp("1:2:3")).toBeNull();
  });

  it("folds IPv4-mapped IPv6 addresses", () => {
    expect(parseIp("::ffff:192.168.1.1")).toEqual({ family: 4, value: 0xc0a80101n });
  });

  it("strips brackets and zone ids", () => {
    expect(parseIp("[::1]")).toEqual({ family: 6, value: 1n });
    expect(parseIp("fe80::1%eth0")).not.toBeNull();
  });
});

describe("parseCidr", () => {
  it("masks host bits", () => {
    expect(parseCidr("10.1.2.3/8")).toEqual({ family: 4, value: 0x0a000000n, prefix: 8 });
    expect(parseCidr("192.168.1.5/32")).toEqual({ family: 4, value: 0xc0a80105n, prefix: 32 });
  });

  it("defaults to a host route", () => {
    expect(parseCidr("10.0.0.1")?.prefix).toBe(32);
    expect(parseCidr("2001:db8::1")?.prefix).toBe(128);
  });

  it("rejects invalid prefixes", () => {
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("10.0.0.0/abc")).toBeNull();
    expect(parseCidr("garbage")).toBeNull();
  });
});

describe("ipMatchesCidr", () => {
  it("matches IPv4 prefixes", () => {
    expect(ipMatchesCidr("10.5.6.7", "10.0.0.0/8")).toBe(true);
    expect(ipMatchesCidr("11.5.6.7", "10.0.0.0/8")).toBe(false);
    expect(ipMatchesCidr("192.168.1.1", "192.168.1.1/32")).toBe(true);
    expect(ipMatchesCidr("192.168.1.2", "192.168.1.1/32")).toBe(false);
  });

  it("matches IPv6 prefixes", () => {
    expect(ipMatchesCidr("2001:db8::5", "2001:db8::/32")).toBe(true);
    expect(ipMatchesCidr("2001:db9::5", "2001:db8::/32")).toBe(false);
  });

  it("does not mix address families", () => {
    expect(ipMatchesCidr("10.0.0.1", "::/0")).toBe(false);
  });
});

describe("isIpAllowed", () => {
  it("allows everything when the list is empty", () => {
    expect(isIpAllowed("203.0.113.5", [])).toBe(true);
  });

  it("requires a match when configured", () => {
    expect(isIpAllowed("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(isIpAllowed("203.0.113.5", ["10.0.0.0/8"])).toBe(false);
  });
});
