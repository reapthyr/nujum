import type { ModuleKey } from "./constants";

export type ModuleCategory = "core" | "community" | "utility";

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  category: ModuleCategory;
  defaultEnabled: boolean;
  /** Lucide icon name used by the dashboard. */
  icon: string;
  /** Relative dashboard path under /dashboard/[guildId]. */
  path: string;
  /** Whether the module needs live Discord data from the Bot API. */
  requiresBotApi: boolean;
}

export const MODULES: readonly ModuleDefinition[] = [
  {
    key: "TICKETS",
    name: "Tickets",
    description: "Private support channels with panels, transcripts, ratings and staff workflows.",
    category: "core",
    defaultEnabled: false,
    icon: "Ticket",
    path: "tickets",
    requiresBotApi: true,
  },
  {
    key: "JTC",
    name: "Join to Create",
    description: "Temporary voice rooms with a full control panel, presets and automatic cleanup.",
    category: "community",
    defaultEnabled: false,
    icon: "Mic2",
    path: "join-to-create",
    requiresBotApi: true,
  },
  {
    key: "WELCOME",
    name: "Welcome & Goodbye",
    description: "Embedded greetings and farewells with placeholders and DM delivery.",
    category: "core",
    defaultEnabled: false,
    icon: "Sparkles",
    path: "welcome",
    requiresBotApi: true,
  },
  {
    key: "VERIFICATION",
    name: "Verification",
    description: "Gate new members behind a button, captcha or account-age check.",
    category: "core",
    defaultEnabled: false,
    icon: "ShieldCheck",
    path: "verification",
    requiresBotApi: true,
  },
  {
    key: "MODERATION",
    name: "Moderation",
    description: "Cases, warnings, escalating punishments, temp actions and appeals.",
    category: "core",
    defaultEnabled: true,
    icon: "Gavel",
    path: "moderation",
    requiresBotApi: false,
  },
  {
    key: "LOGGING",
    name: "Logging",
    description: "Route every Discord event to its own channel with ignore lists.",
    category: "core",
    defaultEnabled: true,
    icon: "ScrollText",
    path: "logging",
    requiresBotApi: true,
  },
  {
    key: "SECURITY",
    name: "Security",
    description: "Anti-raid, anti-nuke, anti-spam, phishing detection and lockdown.",
    category: "core",
    defaultEnabled: true,
    icon: "ShieldAlert",
    path: "security",
    requiresBotApi: false,
  },
  {
    key: "LEVELING",
    name: "Leveling",
    description: "XP, rank cards and automatic level roles.",
    category: "community",
    defaultEnabled: false,
    icon: "TrendingUp",
    path: "modules/leveling",
    requiresBotApi: false,
  },
  {
    key: "GIVEAWAYS",
    name: "Giveaways",
    description: "Timed giveaways with requirements, rerolls and entry tracking.",
    category: "community",
    defaultEnabled: false,
    icon: "Gift",
    path: "modules/giveaways",
    requiresBotApi: true,
  },
  {
    key: "SUGGESTIONS",
    name: "Suggestions",
    description: "Member suggestions with voting and staff decisions.",
    category: "community",
    defaultEnabled: false,
    icon: "Lightbulb",
    path: "modules/suggestions",
    requiresBotApi: true,
  },
  {
    key: "POLLS",
    name: "Polls",
    description: "Native Discord polls with live tallying and scheduled close.",
    category: "community",
    defaultEnabled: false,
    icon: "BarChart3",
    path: "modules/polls",
    requiresBotApi: true,
  },
  {
    key: "STARBOARD",
    name: "Starboard",
    description: "Surface the messages your community loves.",
    category: "community",
    defaultEnabled: false,
    icon: "Star",
    path: "modules/starboard",
    requiresBotApi: true,
  },
  {
    key: "REMINDERS",
    name: "Reminders",
    description: "Personal reminders delivered by DM or channel.",
    category: "utility",
    defaultEnabled: true,
    icon: "AlarmClock",
    path: "modules/reminders",
    requiresBotApi: false,
  },
  {
    key: "AFK",
    name: "AFK",
    description: "Away statuses with automatic replies and mention clearing.",
    category: "utility",
    defaultEnabled: true,
    icon: "Moon",
    path: "modules/afk",
    requiresBotApi: false,
  },
  {
    key: "BIRTHDAYS",
    name: "Birthdays",
    description: "Birthday collection with timezone-aware announcements.",
    category: "community",
    defaultEnabled: false,
    icon: "Cake",
    path: "modules/birthdays",
    requiresBotApi: false,
  },
  {
    key: "TEMPROLES",
    name: "Temporary Roles",
    description: "Grant roles for a fixed duration, restored safely across restarts.",
    category: "utility",
    defaultEnabled: false,
    icon: "Timer",
    path: "modules/temp-roles",
    requiresBotApi: false,
  },
  {
    key: "STATCHANNELS",
    name: "Stat Channels",
    description: "Live member, online and boost counters in channel names.",
    category: "utility",
    defaultEnabled: false,
    icon: "Activity",
    path: "modules/stat-channels",
    requiresBotApi: true,
  },
  {
    key: "ANNOUNCEMENTS",
    name: "Scheduled Announcements",
    description: "Cron-based announcements with timezone support.",
    category: "utility",
    defaultEnabled: false,
    icon: "Megaphone",
    path: "modules/announcements",
    requiresBotApi: true,
  },
  {
    key: "AUTOMOD",
    name: "Auto-mod",
    description: "Spam, flood, mention, invite, link and phishing filters with punishments.",
    category: "core",
    defaultEnabled: true,
    icon: "Bot",
    path: "automod",
    requiresBotApi: false,
  },
  {
    key: "FAQ",
    name: "FAQ & Keywords",
    description: "Automatic answers for common questions and trigger words.",
    category: "utility",
    defaultEnabled: false,
    icon: "MessageCircleQuestion",
    path: "faq",
    requiresBotApi: false,
  },
  {
    key: "EMBEDBUILDER",
    name: "Embed Builder",
    description: "Design and send rich embeds from the dashboard.",
    category: "utility",
    defaultEnabled: true,
    icon: "LayoutTemplate",
    path: "embed-builder",
    requiresBotApi: true,
  },
] as const;

export const MODULE_DEFINITIONS: Readonly<Record<ModuleKey, ModuleDefinition>> = Object.freeze(
  Object.fromEntries(MODULES.map((module) => [module.key, module])) as Record<
    ModuleKey,
    ModuleDefinition
  >,
);

export function isModuleKey(value: string): value is ModuleKey {
  return value in MODULE_DEFINITIONS;
}

export const DEFAULT_MODULE_STATE: Readonly<Record<ModuleKey, boolean>> = Object.freeze(
  Object.fromEntries(MODULES.map((module) => [module.key, module.defaultEnabled])) as Record<
    ModuleKey,
    boolean
  >,
);

export const CORE_MODULES: readonly ModuleDefinition[] = MODULES.filter(
  (module) => module.category === "core",
);
export const COMMUNITY_MODULES: readonly ModuleDefinition[] = MODULES.filter(
  (module) => module.category === "community",
);
export const UTILITY_MODULES: readonly ModuleDefinition[] = MODULES.filter(
  (module) => module.category === "utility",
);
