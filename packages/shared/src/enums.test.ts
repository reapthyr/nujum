import { describe, expect, it } from "vitest";
import {
  ActorType as PActorType,
  AppealStatus as PAppealStatus,
  BackupType as PBackupType,
  BlacklistType as PBlacklistType,
  CaseStatus as PCaseStatus,
  CaseType as PCaseType,
  GiveawayStatus as PGiveawayStatus,
  IgnoreType as PIgnoreType,
  KeywordMatchType as PKeywordMatchType,
  LogEvent as PLogEvent,
  ModuleKey as PModuleKey,
  PanelType as PPanelType,
  PollStatus as PPollStatus,
  Punishment as PPunishment,
  RolePanelMode as PRolePanelMode,
  ScheduledActionType as PScheduledActionType,
  StatChannelType as PStatChannelType,
  SuggestionStatus as PSuggestionStatus,
  ThreatType as PThreatType,
  TicketPriority as PTicketPriority,
  TicketStatus as PTicketStatus,
  VerificationMode as PVerificationMode,
  WhitelistType as PWhitelistType,
} from "@prisma/client";
import {
  ACTOR_TYPES,
  APPEAL_STATUSES,
  BACKUP_TYPES,
  BLACKLIST_TYPES,
  CASE_STATUSES,
  CASE_TYPES,
  GIVEAWAY_STATUSES,
  IGNORE_TYPES,
  KEYWORD_MATCH_TYPES,
  LOG_EVENTS,
  MODULE_KEYS,
  PANEL_TYPES,
  POLL_STATUSES,
  PUNISHMENTS,
  ROLE_PANEL_MODES,
  SCHEDULED_ACTION_TYPES,
  STAT_CHANNEL_TYPES,
  SUGGESTION_STATUSES,
  THREAT_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  VERIFICATION_MODES,
  WHITELIST_TYPES,
} from "./constants";
import { DEFAULT_MODULE_STATE } from "./modules";

type EnumPair = readonly [string, Readonly<Record<string, string>>, readonly string[]];

const pairs: readonly EnumPair[] = [
  ["ActorType", PActorType, ACTOR_TYPES],
  ["AppealStatus", PAppealStatus, APPEAL_STATUSES],
  ["BackupType", PBackupType, BACKUP_TYPES],
  ["BlacklistType", PBlacklistType, BLACKLIST_TYPES],
  ["CaseStatus", PCaseStatus, CASE_STATUSES],
  ["CaseType", PCaseType, CASE_TYPES],
  ["GiveawayStatus", PGiveawayStatus, GIVEAWAY_STATUSES],
  ["IgnoreType", PIgnoreType, IGNORE_TYPES],
  ["KeywordMatchType", PKeywordMatchType, KEYWORD_MATCH_TYPES],
  ["LogEvent", PLogEvent, LOG_EVENTS],
  ["ModuleKey", PModuleKey, MODULE_KEYS],
  ["PanelType", PPanelType, PANEL_TYPES],
  ["PollStatus", PPollStatus, POLL_STATUSES],
  ["Punishment", PPunishment, PUNISHMENTS],
  ["RolePanelMode", PRolePanelMode, ROLE_PANEL_MODES],
  ["ScheduledActionType", PScheduledActionType, SCHEDULED_ACTION_TYPES],
  ["StatChannelType", PStatChannelType, STAT_CHANNEL_TYPES],
  ["SuggestionStatus", PSuggestionStatus, SUGGESTION_STATUSES],
  ["ThreatType", PThreatType, THREAT_TYPES],
  ["TicketPriority", PTicketPriority, TICKET_PRIORITIES],
  ["TicketStatus", PTicketStatus, TICKET_STATUSES],
  ["VerificationMode", PVerificationMode, VERIFICATION_MODES],
  ["WhitelistType", PWhitelistType, WHITELIST_TYPES],
];

describe("enum parity with Prisma", () => {
  it.each(pairs)("%s matches the database enum", (_name, prismaEnum, localValues) => {
    expect([...localValues].sort()).toEqual(Object.values(prismaEnum).sort());
  });

  it("defines default state for every module", () => {
    expect(Object.keys(DEFAULT_MODULE_STATE).sort()).toEqual([...MODULE_KEYS].sort());
  });
});
