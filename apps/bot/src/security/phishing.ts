/**
 * Link, invite and phishing classification.
 *
 * The phishing list is intentionally small and high-confidence: false positives
 * delete legitimate messages, so only known scam hosts and clear typosquats are
 * treated as phishing. Everything else falls under the configurable link filter.
 */

export const PHISHING_DOMAINS: ReadonlySet<string> = new Set([
  "discord-nitro.com",
  "discordnitro.com",
  "discord-gift.com",
  "discordgift.com",
  "discord-gifts.com",
  "discordpromo.com",
  "discord-airdrop.com",
  "discord-app.com",
  "discordapp.gift",
  "dlscord.com",
  "dlscord.gift",
  "free-nitro.com",
  "nitro-gift.com",
  "nitro-discord.com",
  "freegiftdiscord.com",
  "steamcommunlty.com",
  "steamcommunity-gift.com",
  "steamcommunitygift.com",
  "csgo-skins-gift.com",
]);

export const URL_SHORTENERS: ReadonlySet<string> = new Set([
  "bit.ly",
  "cutt.ly",
  "is.gd",
  "rebrand.ly",
  "shorturl.at",
  "t.co",
  "tiny.cc",
  "tinyurl.com",
]);

const OFFICIAL_DISCORD_HOSTS: readonly string[] = [
  "discord.com",
  "discord.gg",
  "discord.co",
  "discord.media",
  "discordapp.com",
  "discordapp.net",
  "discordcdn.com",
  "discordstatus.com",
];

const SCAM_KEYWORDS = /(nitro|gift|steam|airdrop|free|claim|giveaway)/i;
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi;
const INVITE_PATTERN = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,64})/i;

/** Lowercases a hostname, strips `www.`, a trailing dot and any port. */
export function normalizeHost(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
      .split("/")[0]
      ?.replace(/:\d+$/, "")
      .replace(/^www\./, "")
      .replace(/\.$/, "") ?? ""
  );
}

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isOfficialDiscordHost(host: string): boolean {
  return OFFICIAL_DISCORD_HOSTS.some((domain) => isHostOrSubdomain(host, domain));
}

/** Returns the URL host, or null for relative/garbage values. */
export function hostFromUrl(value: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const host = normalizeHost(new URL(candidate).hostname);
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

export function extractLinks(content: string): string[] {
  const matches = content.match(LINK_PATTERN) ?? [];
  const cleaned = matches
    .map((match) => match.replace(/[.,;:!?]+$/, ""))
    .filter((match) => match.length > 4);
  return [...new Set(cleaned)];
}

export function extractInviteCode(content: string): string | null {
  const match = INVITE_PATTERN.exec(content);
  return match?.[1]?.toLowerCase() ?? null;
}

/** True when the host is in the guild allowlist (subdomains included). */
export function isHostAllowed(host: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some((entry) => {
    const domain = normalizeHost(entry);
    return domain.length > 0 && isHostOrSubdomain(host, domain);
  });
}

export function isPhishingHost(host: string, content = ""): boolean {
  if (isOfficialDiscordHost(host)) return false;
  if (PHISHING_DOMAINS.has(host)) return true;
  if ([...PHISHING_DOMAINS].some((domain) => isHostOrSubdomain(host, domain))) return true;

  // Typosquats: anything pretending to be Discord/Steam but not on their domain.
  if (host.includes("discord")) return true;
  if (/steamcommun/i.test(host) && !isHostOrSubdomain(host, "steamcommunity.com")) return true;
  if (host.includes("xn--") && /(discord|steam|nitro)/i.test(host)) return true;

  // Obvious scam phrasing in the hostname itself.
  if (/(free|claim|airdrop|gift).*nitro|nitro.*(free|gift|claim|airdrop)/i.test(host)) return true;

  // Shorteners hide the destination, so only flag them alongside scam wording.
  if (URL_SHORTENERS.has(host) && SCAM_KEYWORDS.test(content)) return true;

  return false;
}
