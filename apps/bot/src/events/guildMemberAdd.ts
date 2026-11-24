import { serializeError } from "../lib/errors";
import { sendSecurityAlert } from "../security/alerts";
import { isExempt, subjectFromMember } from "../security/exemptions";
import { activateLockdown } from "../security/lockdown";
import { applyPunishment } from "../security/punish";
import { meetsAccountAge } from "../security/verification/grant";
import { defineEvent } from "./types";

/**
 * Two independent pipelines run on join:
 *  1. Verification creates a pending session (never grants a role by itself).
 *  2. Anti-raid evaluates the join rate and account ages.
 */
export const event = defineEvent({
  name: "guildMemberAdd",
  execute: async (client, member) => {
    const guild = member.guild;
    try {
      if (await client.modules.isEnabled(guild.id, "VERIFICATION")) {
        const settings = await client.verification.settings(guild.id);
        if (
          settings.enabled &&
          !meetsAccountAge(member.user, settings.minAccountAgeDays, Date.now())
        ) {
          try {
            await member.send({
              content: `Welcome to **${guild.name}**! Your account is newer than ${settings.minAccountAgeDays} day(s). Go to ${settings.channelId ? `<#${settings.channelId}>` : "the verification channel"} to verify.`,
              allowedMentions: { parse: [] },
            });
          } catch {
            // DMs can be closed; the in-guild panel remains authoritative.
          }
        }
      }

      if (!(await client.modules.isEnabled(guild.id, "SECURITY"))) return;

      const snapshot = await client.security.snapshot(guild.id);
      const verdict = client.raidDetector.record(
        guild.id,
        {
          userId: member.id,
          accountCreatedAt: member.user.createdTimestamp,
          now: Date.now(),
        },
        snapshot.settings,
      );
      if (!verdict.triggered) return;

      const reason = verdict.reason ?? "Mass join threshold reached.";
      const young = new Set(verdict.youngAccountIds);
      const exempt = isExempt(subjectFromMember(member), {
        guildOwnerId: guild.ownerId,
        botUserId: client.user?.id ?? null,
        ownerIds: client.owners,
        whitelist: snapshot.whitelist,
        // Raid checks must also catch privileged accounts.
      });

      let actionTaken = "Alert only";
      if (snapshot.settings.raidAction === "LOCKDOWN") {
        if (snapshot.settings.autoLockdown) {
          const lockdown = await activateLockdown(guild, client.security, client.logger, {
            reason,
            activatedBy: client.user?.id ?? "system",
          });
          actionTaken = `Locked ${lockdown.changed} channel(s)`;
        }
      } else if (!exempt && young.has(member.id)) {
        const punishment = await applyPunishment({
          punishment: snapshot.settings.raidAction,
          reason,
          member,
          logger: client.logger,
          scope: "raid",
        });
        actionTaken = punishment.description;
      }

      const threat = {
        type: "RAID" as const,
        severity: 3 as const,
        actorId: member.id,
        reason,
        evidence: `${verdict.joins} joins / ${verdict.youngAccounts} young accounts in ${snapshot.settings.raidWindowSeconds}s`,
        actionTaken,
      };
      await client.security.recordThreat({
        guildId: guild.id,
        ...threat,
        details: {
          joins: verdict.joins,
          youngAccounts: verdict.youngAccounts,
          windowSeconds: snapshot.settings.raidWindowSeconds,
        },
      });
      await client.security.audit({
        guildId: guild.id,
        actorId: client.user?.id ?? "system",
        actorType: "BOT",
        action: "security.raid.detected",
        targetType: "Guild",
        targetId: guild.id,
        reason,
        after: { actionTaken },
      });

      client.logger.error(
        {
          guildId: guild.id,
          joins: verdict.joins,
          youngAccounts: verdict.youngAccounts,
          actionTaken,
        },
        "raid detected",
      );
      if (client.securityThrottle.allow(`${guild.id}:raid`, Date.now(), 60_000)) {
        await sendSecurityAlert({
          guild,
          settings: snapshot.settings,
          threat,
          logger: client.logger,
          lockdownActive: snapshot.settings.raidAction === "LOCKDOWN",
        });
      }
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: member.id },
        "guildMemberAdd handler failed",
      );
    }
  },
});
