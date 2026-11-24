import type { ModuleKey } from "../constants";

export const CONFIG_SOURCES = ["DASHBOARD", "BOT", "SYSTEM"] as const;
export type ConfigSource = (typeof CONFIG_SOURCES)[number];

/** Payload sent through PostgreSQL `NOTIFY nujum_config`. */
export interface ConfigNotifyPayload {
  guildId: string;
  version: number;
  source: ConfigSource;
  action?: string;
  changedBy?: string;
  at: string;
}

/** In-memory representation the bot keeps per guild. */
export interface CachedGuildConfig {
  guildId: string;
  version: number;
  loadedAt: number;
  modules: Record<ModuleKey, boolean>;
}
