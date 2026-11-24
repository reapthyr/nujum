import { EmbedBuilder } from "discord.js";
import { BRAND } from "@nujum/shared";

export interface BaseEmbedOptions {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  footer?: string;
  thumbnail?: string;
}

/** Every Nujum embed shares the same footer, colour and timestamp. */
export function baseEmbed(options: BaseEmbedOptions = {}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(options.color ?? BRAND.defaultColor)
    .setFooter({ text: options.footer ?? `${BRAND.name} • ${BRAND.tagline}` })
    .setTimestamp(new Date());

  if (options.title) embed.setTitle(options.title.slice(0, 256));
  if (options.description) embed.setDescription(options.description.slice(0, 4096));
  if (options.url) embed.setURL(options.url);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  return embed;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({ title, description, color: BRAND.colors.success });
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({ title, description, color: BRAND.colors.danger });
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({ title, description, color: BRAND.colors.warning });
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed({ title, description, color: BRAND.colors.aurora });
}

/** Truncates text to a Discord-safe length without splitting a surrogate pair. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
