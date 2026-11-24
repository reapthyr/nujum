/**
 * IP / CIDR helpers used by the internal API allowlist.
 *
 * IPv4 and IPv6 are both reduced to a bigint so a prefix comparison is one
 * shift. IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) are folded back to
 * IPv4, which is what Node reports for dual-stack sockets.
 */

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

export interface ParsedIp {
  family: 4 | 6;
  value: bigint;
}

export interface ParsedCidr {
  family: 4 | 6;
  value: bigint;
  prefix: number;
}

function parseIpv4(input: string): bigint | null {
  const match = IPV4_PATTERN.exec(input);
  if (!match) return null;
  let value = 0n;
  for (let index = 1; index <= 4; index += 1) {
    const octet = Number(match[index]);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function expandIpv6(input: string): string[] | null {
  let address = input;
  if (address.includes(".")) {
    // Mixed notation: replace the trailing IPv4 with two hex groups.
    const lastColon = address.lastIndexOf(":");
    if (lastColon === -1) return null;
    const ipv4 = parseIpv4(address.slice(lastColon + 1));
    if (ipv4 === null) return null;
    const high = ((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = (ipv4 & 0xffffn).toString(16);
    address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;

  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && missing < 1) return null;

  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  if (groups.length !== 8) return null;
  if (groups.some((group) => !IPV6_GROUP_PATTERN.test(group))) return null;
  return groups;
}

export function parseIp(input: string): ParsedIp | null {
  const address = input.trim().replace(/^\[/, "").replace(/\]$/, "").split("%")[0] ?? "";
  if (address === "") return null;

  const ipv4 = parseIpv4(address);
  if (ipv4 !== null) return { family: 4, value: ipv4 };

  const groups = expandIpv6(address);
  if (groups === null) return null;

  let value = 0n;
  for (const group of groups) {
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }

  // Fold ::ffff:a.b.c.d back to IPv4 for consistent allowlist matching.
  if (value >> 32n === 0xffffn) {
    return { family: 4, value: value & 0xffffffffn };
  }
  return { family: 6, value };
}

export function parseCidr(input: string): ParsedCidr | null {
  const entry = input.trim();
  if (entry === "") return null;

  const slash = entry.lastIndexOf("/");
  const addressPart = slash === -1 ? entry : entry.slice(0, slash);
  const ip = parseIp(addressPart);
  if (ip === null) return null;

  const maxPrefix = ip.family === 4 ? 32 : 128;
  let prefix = maxPrefix;
  if (slash !== -1) {
    const raw = entry.slice(slash + 1);
    if (!/^\d{1,3}$/.test(raw)) return null;
    prefix = Number(raw);
    if (prefix > maxPrefix) return null;
  }

  const bits = BigInt(ip.family === 4 ? 32 : 128);
  const hostMask = (1n << (bits - BigInt(prefix))) - 1n;
  return { family: ip.family, value: ip.value & ~hostMask, prefix };
}

export function isValidCidr(input: string): boolean {
  return parseCidr(input) !== null;
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const parsedIp = parseIp(ip);
  const parsedCidr = parseCidr(cidr);
  if (parsedIp === null || parsedCidr === null) return false;
  if (parsedIp.family !== parsedCidr.family) return false;

  const bits = BigInt(parsedIp.family === 4 ? 32 : 128);
  const shift = bits - BigInt(parsedCidr.prefix);
  return parsedIp.value >> shift === parsedCidr.value >> shift;
}

/**
 * An empty allowlist means "any IP with a valid signature" — HMAC remains the
 * primary control because Vercel egress IPs are dynamic.
 */
export function isIpAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((cidr) => ipMatchesCidr(ip, cidr));
}
