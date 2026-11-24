-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'DASHBOARD', 'BOT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('TICKETS', 'JTC', 'WELCOME', 'VERIFICATION', 'MODERATION', 'LOGGING', 'SECURITY', 'LEVELING', 'GIVEAWAYS', 'SUGGESTIONS', 'POLLS', 'STARBOARD', 'REMINDERS', 'AFK', 'BIRTHDAYS', 'TEMPROLES', 'STATCHANNELS', 'ANNOUNCEMENTS', 'AUTOMOD', 'FAQ', 'EMBEDBUILDER');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('BAN', 'KICK', 'TIMEOUT', 'WARN', 'SOFTBAN', 'UNBAN', 'UNMUTE', 'PURGE', 'SLOWMODE', 'LOCK', 'UNLOCK', 'NICK');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Punishment" AS ENUM ('NONE', 'DELETE', 'WARN', 'TIMEOUT', 'KICK', 'BAN', 'LOCKDOWN');

-- CreateEnum
CREATE TYPE "ThreatType" AS ENUM ('MASS_JOIN', 'RAID', 'SPAM', 'FLOOD', 'MASS_MENTION', 'INVITE', 'LINK', 'PHISHING', 'MASS_CHANNEL_DELETE', 'MASS_ROLE_DELETE', 'MASS_BAN', 'MASS_KICK', 'WEBHOOK_CREATE', 'PERMISSION_ESCALATION');

-- CreateEnum
CREATE TYPE "WhitelistType" AS ENUM ('USER', 'ROLE', 'CHANNEL', 'DOMAIN', 'INVITE');

-- CreateEnum
CREATE TYPE "IgnoreType" AS ENUM ('CHANNEL', 'ROLE', 'USER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLAIMED', 'CLOSED', 'DELETED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PanelType" AS ENUM ('BUTTONS', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "VerificationMode" AS ENUM ('BUTTON', 'CAPTCHA', 'ACCOUNT_AGE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AutoRoleTrigger" AS ENUM ('JOIN', 'BOT', 'VERIFIED');

-- CreateEnum
CREATE TYPE "RolePanelMode" AS ENUM ('TOGGLE', 'UNIQUE', 'MULTI');

-- CreateEnum
CREATE TYPE "LogEvent" AS ENUM ('MESSAGE_EDIT', 'MESSAGE_DELETE', 'MESSAGE_BULK_DELETE', 'MEMBER_JOIN', 'MEMBER_LEAVE', 'MEMBER_NICK', 'MEMBER_ROLE_ADD', 'MEMBER_ROLE_REMOVE', 'MEMBER_BAN', 'MEMBER_UNBAN', 'MEMBER_TIMEOUT', 'CHANNEL_CREATE', 'CHANNEL_DELETE', 'CHANNEL_UPDATE', 'ROLE_CREATE', 'ROLE_DELETE', 'ROLE_UPDATE', 'VOICE_JOIN', 'VOICE_LEAVE', 'VOICE_MOVE', 'INVITE_CREATE', 'INVITE_DELETE', 'THREAD_CREATE', 'THREAD_DELETE', 'WEBHOOK_UPDATE');

-- CreateEnum
CREATE TYPE "KeywordMatchType" AS ENUM ('EXACT', 'CONTAINS', 'REGEX');

-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DENIED', 'IMPLEMENTED');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ScheduledActionType" AS ENUM ('TEMPBAN', 'TEMPMUTE', 'TEMPROLE', 'REMINDER', 'GIVEAWAY_END', 'POLL_END', 'ANNOUNCEMENT', 'TICKET_AUTOCLOSE', 'TICKET_WARN', 'VERIFICATION_EXPIRE');

-- CreateEnum
CREATE TYPE "ScheduledActionStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('CONFIG', 'STRUCTURE');

-- CreateEnum
CREATE TYPE "BlacklistType" AS ENUM ('USER', 'GUILD', 'DOMAIN');

-- CreateEnum
CREATE TYPE "StatChannelType" AS ENUM ('MEMBERS', 'ONLINE', 'BOOSTS');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconHash" TEXT,
    "ownerId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "brandColor" INTEGER NOT NULL DEFAULT 9133302,
    "embedFooter" TEXT,
    "botNickname" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "caseCounter" INTEGER NOT NULL DEFAULT 0,
    "ticketCounter" INTEGER NOT NULL DEFAULT 0,
    "premiumTier" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildModule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "revertedById" TEXT,
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingBotAction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PendingBotAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "type" "BlacklistType" NOT NULL,
    "value" TEXT NOT NULL,
    "guildId" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "guildAllowlist" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "BotPresence" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "status" TEXT NOT NULL DEFAULT 'online',
    "activities" JSONB NOT NULL DEFAULT '[]',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotStatus" (
    "id" TEXT NOT NULL,
    "shardId" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "guildCount" INTEGER NOT NULL DEFAULT 0,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "ping" INTEGER NOT NULL DEFAULT 0,
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildStatSnapshot" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "onlineCount" INTEGER NOT NULL DEFAULT 0,
    "boostCount" INTEGER NOT NULL DEFAULT 0,
    "ticketsOpen" INTEGER NOT NULL DEFAULT 0,
    "modActions" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "joins" INTEGER NOT NULL DEFAULT 0,
    "leaves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuildStatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "globalName" TEXT,
    "avatar" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "reauthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityConfig" (
    "guildId" TEXT NOT NULL,
    "antiRaidEnabled" BOOLEAN NOT NULL DEFAULT true,
    "raidJoinThreshold" INTEGER NOT NULL DEFAULT 10,
    "raidWindowSeconds" INTEGER NOT NULL DEFAULT 30,
    "raidMinAccountAgeDays" INTEGER NOT NULL DEFAULT 7,
    "raidAction" "Punishment" NOT NULL DEFAULT 'LOCKDOWN',
    "antiNukeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nukeThreshold" INTEGER NOT NULL DEFAULT 3,
    "nukeWindowSeconds" INTEGER NOT NULL DEFAULT 60,
    "antiSpamEnabled" BOOLEAN NOT NULL DEFAULT true,
    "spamThreshold" INTEGER NOT NULL DEFAULT 7,
    "spamWindowSeconds" INTEGER NOT NULL DEFAULT 5,
    "spamAction" "Punishment" NOT NULL DEFAULT 'TIMEOUT',
    "mentionLimit" INTEGER NOT NULL DEFAULT 5,
    "inviteFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linkFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "phishingDetection" BOOLEAN NOT NULL DEFAULT true,
    "allowedDomains" TEXT[],
    "allowedInviteCodes" TEXT[],
    "alertChannelId" TEXT,
    "autoLockdown" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "SecurityWhitelist" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "WhitelistType" NOT NULL,
    "value" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreatEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "ThreatType" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "actorId" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "actionTaken" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockdownState" (
    "guildId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "LockdownState_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ModerationConfig" (
    "guildId" TEXT NOT NULL,
    "modLogChannelId" TEXT,
    "dmOnAction" BOOLEAN NOT NULL DEFAULT true,
    "appealInfo" TEXT,
    "warnExpiryDays" INTEGER NOT NULL DEFAULT 90,
    "autoEscalate" BOOLEAN NOT NULL DEFAULT true,
    "requireReason" BOOLEAN NOT NULL DEFAULT true,
    "mutedRoleId" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "EscalationRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "action" "Punishment" NOT NULL,
    "durationSeconds" INTEGER,

    CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModCase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "type" "CaseType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "dmSent" BOOLEAN NOT NULL DEFAULT false,
    "evidenceUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "staffOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "votes" JSONB NOT NULL DEFAULT '[]',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "ScheduledActionType" NOT NULL,
    "targetId" TEXT,
    "channelId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "executeAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "panelChannelId" TEXT,
    "transcriptChannelId" TEXT,
    "logChannelId" TEXT,
    "supportRoleIds" TEXT[],
    "maxOpenPerUser" INTEGER NOT NULL DEFAULT 1,
    "inactivityHours" INTEGER NOT NULL DEFAULT 48,
    "warnBeforeHours" INTEGER NOT NULL DEFAULT 6,
    "namingFormat" TEXT NOT NULL DEFAULT 'ticket-{number}',
    "ratingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "TicketCategory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "discordCategoryId" TEXT,
    "supportRoleIds" TEXT[],
    "formFields" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" "PanelType" NOT NULL DEFAULT 'BUTTONS',
    "embed" JSONB NOT NULL,
    "categoryIds" TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "openerId" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "claimedBy" TEXT,
    "closedBy" TEXT,
    "closeReason" TEXT,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketParticipant" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketBlacklist" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTranscript" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JtcConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "generatorChannelId" TEXT,
    "categoryId" TEXT,
    "nameTemplate" TEXT NOT NULL DEFAULT '{username}''s Room',
    "defaultLimit" INTEGER NOT NULL DEFAULT 0,
    "defaultBitrate" INTEGER NOT NULL DEFAULT 64,
    "defaultRegion" TEXT DEFAULT 'auto',
    "panelChannelId" TEXT,
    "interfaceChannelId" TEXT,
    "trustedRoleIds" TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JtcConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "JtcRoom" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "bitrate" INTEGER NOT NULL DEFAULT 64,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JtcRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JtcPreset" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "bitrate" INTEGER NOT NULL DEFAULT 64,
    "region" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JtcPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeConfig" (
    "guildId" TEXT NOT NULL,
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeChannelId" TEXT,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Welcome {user} to **{server}**! You are member #{memberCount}.',
    "welcomeEmbed" JSONB,
    "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeChannelId" TEXT,
    "goodbyeMessage" TEXT NOT NULL DEFAULT '**{user}** left the server.',
    "goodbyeEmbed" JSONB,
    "dmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dmMessage" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "VerificationConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "VerificationMode" NOT NULL DEFAULT 'BUTTON',
    "channelId" TEXT,
    "roleId" TEXT,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 7,
    "message" TEXT NOT NULL DEFAULT 'Click the button below to verify.',
    "embed" JSONB,
    "captchaProvider" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "trigger" "AutoRoleTrigger" NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AutoRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "PanelType" NOT NULL DEFAULT 'BUTTONS',
    "mode" "RolePanelMode" NOT NULL DEFAULT 'TOGGLE',
    "maxRoles" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePanelOption" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "style" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "RolePanelOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoggingConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultChannelId" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoggingConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "LogRoute" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "event" "LogEvent" NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LogRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogIgnore" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "IgnoreType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "event" "LogEvent",

    CONSTRAINT "LogIgnore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteRecord" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviterId" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InviteRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "xpMin" INTEGER NOT NULL DEFAULT 15,
    "xpMax" INTEGER NOT NULL DEFAULT 25,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "announceChannelId" TEXT,
    "announceLevelUp" BOOLEAN NOT NULL DEFAULT true,
    "noXpChannelIds" TEXT[],
    "noXpRoleIds" TEXT[],
    "stackRoles" BOOLEAN NOT NULL DEFAULT false,
    "curve" JSONB NOT NULL DEFAULT '{"type":"quadratic","base":100}',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "LevelRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "LevelRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberLevel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "voiceSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),

    CONSTRAINT "MemberLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordResponse" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "matchType" "KeywordMatchType" NOT NULL DEFAULT 'CONTAINS',
    "response" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "uses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KeywordResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "description" TEXT,
    "winnerCount" INTEGER NOT NULL DEFAULT 1,
    "hostedBy" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "GiveawayStatus" NOT NULL DEFAULT 'SCHEDULED',
    "requirements" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "staffResponse" TEXT,
    "staffId" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionVote" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "SuggestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarboardConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '⭐',
    "threshold" INTEGER NOT NULL DEFAULT 3,
    "allowSelfStar" BOOLEAN NOT NULL DEFAULT false,
    "ignoreBots" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarboardConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "StarboardEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceChannelId" TEXT NOT NULL,
    "starboardMessageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "starCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "endsAt" TIMESTAMP(3),
    "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfkStatus" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT 'AFK',
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfkStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Birthday" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',

    CONSTRAINT "Birthday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "type" "StatChannelType" NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'Members: {count}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastValue" INTEGER,

    CONSTRAINT "StatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAnnouncement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ScheduledAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbedTemplate" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbedTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "BackupType" NOT NULL,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuildModule_guildId_idx" ON "GuildModule"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildModule_guildId_key_key" ON "GuildModule"("guildId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_createdAt_idx" ON "AuditLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "PendingBotAction_status_createdAt_idx" ON "PendingBotAction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingBotAction_guildId_status_idx" ON "PendingBotAction"("guildId", "status");

-- CreateIndex
CREATE INDEX "BlacklistEntry_type_value_idx" ON "BlacklistEntry"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "BlacklistEntry_type_value_guildId_key" ON "BlacklistEntry"("type", "value", "guildId");

-- CreateIndex
CREATE INDEX "GuildStatSnapshot_guildId_capturedAt_idx" ON "GuildStatSnapshot"("guildId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityWhitelist_guildId_type_value_key" ON "SecurityWhitelist"("guildId", "type", "value");

-- CreateIndex
CREATE INDEX "ThreatEvent_guildId_createdAt_idx" ON "ThreatEvent"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "ThreatEvent_guildId_resolved_idx" ON "ThreatEvent"("guildId", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationRule_guildId_warnCount_key" ON "EscalationRule"("guildId", "warnCount");

-- CreateIndex
CREATE INDEX "ModCase_guildId_createdAt_idx" ON "ModCase"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "ModCase_guildId_targetId_idx" ON "ModCase"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "ModCase_guildId_moderatorId_idx" ON "ModCase"("guildId", "moderatorId");

-- CreateIndex
CREATE UNIQUE INDEX "ModCase_guildId_caseNumber_key" ON "ModCase"("guildId", "caseNumber");

-- CreateIndex
CREATE INDEX "CaseNote_caseId_idx" ON "CaseNote"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_caseId_key" ON "Appeal"("caseId");

-- CreateIndex
CREATE INDEX "Appeal_guildId_status_idx" ON "Appeal"("guildId", "status");

-- CreateIndex
CREATE INDEX "ScheduledAction_status_executeAt_idx" ON "ScheduledAction"("status", "executeAt");

-- CreateIndex
CREATE INDEX "ScheduledAction_guildId_targetId_idx" ON "ScheduledAction"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "TicketCategory_guildId_position_idx" ON "TicketCategory"("guildId", "position");

-- CreateIndex
CREATE INDEX "TicketPanel_guildId_idx" ON "TicketPanel"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");

-- CreateIndex
CREATE INDEX "Ticket_guildId_openerId_idx" ON "Ticket"("guildId", "openerId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket"("guildId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TicketParticipant_ticketId_userId_key" ON "TicketParticipant"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "TicketNote_ticketId_idx" ON "TicketNote"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketBlacklist_guildId_userId_key" ON "TicketBlacklist"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTranscript_ticketId_key" ON "TicketTranscript"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTranscript_guildId_createdAt_idx" ON "TicketTranscript"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JtcRoom_channelId_key" ON "JtcRoom"("channelId");

-- CreateIndex
CREATE INDEX "JtcRoom_guildId_ownerId_idx" ON "JtcRoom"("guildId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "JtcPreset_guildId_userId_name_key" ON "JtcPreset"("guildId", "userId", "name");

-- CreateIndex
CREATE INDEX "VerificationSession_status_expiresAt_idx" ON "VerificationSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationSession_guildId_userId_key" ON "VerificationSession"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRole_guildId_roleId_trigger_key" ON "AutoRole"("guildId", "roleId", "trigger");

-- CreateIndex
CREATE INDEX "RolePanel_guildId_idx" ON "RolePanel"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePanelOption_panelId_roleId_key" ON "RolePanelOption"("panelId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "LogRoute_guildId_event_key" ON "LogRoute"("guildId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "LogIgnore_guildId_type_targetId_event_key" ON "LogIgnore"("guildId", "type", "targetId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "InviteRecord_guildId_code_key" ON "InviteRecord"("guildId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LevelRole_guildId_level_key" ON "LevelRole"("guildId", "level");

-- CreateIndex
CREATE INDEX "MemberLevel_guildId_xp_idx" ON "MemberLevel"("guildId", "xp");

-- CreateIndex
CREATE UNIQUE INDEX "MemberLevel_guildId_userId_key" ON "MemberLevel"("guildId", "userId");

-- CreateIndex
CREATE INDEX "FaqEntry_guildId_enabled_idx" ON "FaqEntry"("guildId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordResponse_guildId_trigger_matchType_key" ON "KeywordResponse"("guildId", "trigger", "matchType");

-- CreateIndex
CREATE INDEX "Giveaway_guildId_status_idx" ON "Giveaway"("guildId", "status");

-- CreateIndex
CREATE INDEX "Giveaway_status_endsAt_idx" ON "Giveaway"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_userId_key" ON "GiveawayEntry"("giveawayId", "userId");

-- CreateIndex
CREATE INDEX "Suggestion_guildId_status_idx" ON "Suggestion"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SuggestionVote_suggestionId_userId_key" ON "SuggestionVote"("suggestionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StarboardEntry_guildId_sourceMessageId_key" ON "StarboardEntry"("guildId", "sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_optionIndex_key" ON "PollVote"("pollId", "userId", "optionIndex");

-- CreateIndex
CREATE INDEX "Reminder_status_remindAt_idx" ON "Reminder"("status", "remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "AfkStatus_guildId_userId_key" ON "AfkStatus"("guildId", "userId");

-- CreateIndex
CREATE INDEX "Birthday_month_day_idx" ON "Birthday"("month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Birthday_guildId_userId_key" ON "Birthday"("guildId", "userId");

-- CreateIndex
CREATE INDEX "TempRole_expiresAt_idx" ON "TempRole"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TempRole_guildId_userId_roleId_key" ON "TempRole"("guildId", "userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "StatChannel_channelId_key" ON "StatChannel"("channelId");

-- CreateIndex
CREATE INDEX "StatChannel_guildId_idx" ON "StatChannel"("guildId");

-- CreateIndex
CREATE INDEX "ScheduledAnnouncement_enabled_nextRunAt_idx" ON "ScheduledAnnouncement"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmbedTemplate_guildId_name_key" ON "EmbedTemplate"("guildId", "name");

-- CreateIndex
CREATE INDEX "Backup_guildId_createdAt_idx" ON "Backup"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "GuildModule" ADD CONSTRAINT "GuildModule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingBotAction" ADD CONSTRAINT "PendingBotAction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlacklistEntry" ADD CONSTRAINT "BlacklistEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildStatSnapshot" ADD CONSTRAINT "GuildStatSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityConfig" ADD CONSTRAINT "SecurityConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityWhitelist" ADD CONSTRAINT "SecurityWhitelist_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreatEvent" ADD CONSTRAINT "ThreatEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockdownState" ADD CONSTRAINT "LockdownState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationConfig" ADD CONSTRAINT "ModerationConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRule" ADD CONSTRAINT "EscalationRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModCase" ADD CONSTRAINT "ModCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPanel" ADD CONSTRAINT "TicketPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketBlacklist" ADD CONSTRAINT "TicketBlacklist_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTranscript" ADD CONSTRAINT "TicketTranscript_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTranscript" ADD CONSTRAINT "TicketTranscript_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JtcConfig" ADD CONSTRAINT "JtcConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JtcRoom" ADD CONSTRAINT "JtcRoom_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JtcPreset" ADD CONSTRAINT "JtcPreset_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeConfig" ADD CONSTRAINT "WelcomeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationConfig" ADD CONSTRAINT "VerificationConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoRole" ADD CONSTRAINT "AutoRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePanel" ADD CONSTRAINT "RolePanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePanelOption" ADD CONSTRAINT "RolePanelOption_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "RolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggingConfig" ADD CONSTRAINT "LoggingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogRoute" ADD CONSTRAINT "LogRoute_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogIgnore" ADD CONSTRAINT "LogIgnore_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteRecord" ADD CONSTRAINT "InviteRecord_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelConfig" ADD CONSTRAINT "LevelConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelRole" ADD CONSTRAINT "LevelRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberLevel" ADD CONSTRAINT "MemberLevel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqEntry" ADD CONSTRAINT "FaqEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordResponse" ADD CONSTRAINT "KeywordResponse_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionVote" ADD CONSTRAINT "SuggestionVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardConfig" ADD CONSTRAINT "StarboardConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardEntry" ADD CONSTRAINT "StarboardEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfkStatus" ADD CONSTRAINT "AfkStatus_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Birthday" ADD CONSTRAINT "Birthday_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempRole" ADD CONSTRAINT "TempRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatChannel" ADD CONSTRAINT "StatChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAnnouncement" ADD CONSTRAINT "ScheduledAnnouncement_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedTemplate" ADD CONSTRAINT "EmbedTemplate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
