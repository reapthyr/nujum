/** Compiled build version. Bumped on release; surfaced by /botinfo and /healthz. */
export const BOT_VERSION = "0.2.0";

/** GitHub/website links used by utility commands. */
export const LINKS = {
  website: "https://nujum.app",
  docs: "https://nujum.app/docs",
  status: "https://status.nujum.app",
  privacy: "https://nujum.app/privacy",
  terms: "https://nujum.app/terms",
} as const;

/** Namespace for every component/modal custom id. */
export const COMPONENT_NAMESPACE = "nujum";

/** Maximum custom id length accepted by Discord. */
export const MAX_CUSTOM_ID_LENGTH = 100;
