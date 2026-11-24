/**
 * Pure, dependency-free helpers shared by the bot, the dashboard and tests.
 */

// eslint-disable-next-line no-control-regex -- stripping control characters is the purpose
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const WHITESPACE = /\s+/g;

export interface SanitizeOptions {
  maxLength?: number;
  /** Replace newlines with spaces (for names, reasons, labels). */
  singleLine?: boolean;
}

/** Removes control characters and zero-width characters, trims and truncates. */
export function sanitizeText(input: string, options: SanitizeOptions = {}): string {
  const { maxLength = 2000, singleLine = false } = options;
  let output = input.replace(CONTROL_CHARS, "").replace(ZERO_WIDTH, "");
  output = singleLine
    ? output.replace(WHITESPACE, " ").trim()
    : output.replace(/\r\n/g, "\n").trim();
  return output.slice(0, maxLength);
}

export function sanitizeSingleLine(input: string, maxLength = 200): string {
  return sanitizeText(input, { maxLength, singleLine: true });
}

export function sanitizeMultiline(input: string, maxLength = 2000): string {
  return sanitizeText(input, { maxLength });
}

/**
 * Neutralizes mass mentions in user-supplied content while keeping the visible
 * text readable. Defence in depth on top of `allowedMentions: { parse: [] }`.
 */
export function neutralizeMentions(input: string): string {
  return input
    .replace(/@everyone/gi, "@\u200Beveryone")
    .replace(/@here/gi, "@\u200Bhere")
    .replace(/<@!?(\d{16,20})>/g, "@user")
    .replace(/<@&(\d{16,20})>/g, "@role");
}

/** Escapes Discord markdown so user content cannot break formatting. */
export function escapeMarkdown(input: string): string {
  return input.replace(/([\\*_~`|>])/g, "\\$1");
}

/** Returns a safe, normalized domain (lowercase, no protocol/path) or null. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = withoutProtocol.split(/[/?#]/, 1)[0] ?? "";
  if (!host || host.includes("..")) return null;
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  if (!host.split(".").every((part) => label.test(part))) return null;
  return host;
}

/** Parses a `#RRGGBB` / `RRGGBB` / integer color into a Discord integer color. */
export function parseColor(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isInteger(input) && input >= 0 && input <= 0xffffff ? input : null;
  }
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 16);
}

export function toHexColor(value: number): string {
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Clamps a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Truncates a string to a maximum length without splitting surrogate pairs. */
export function truncate(input: string, maxLength: number, suffix = "…"): string {
  if (input.length <= maxLength) return input;
  const slice = input.slice(0, Math.max(0, maxLength - suffix.length));
  return `${slice}${suffix}`;
}
