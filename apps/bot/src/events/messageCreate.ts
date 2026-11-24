import { defineEvent } from "./types";
import { serializeError } from "../lib/errors";
import { sendSecurityAlert } from "../security/alerts";
import { isExempt, subjectFromMember } from "../security/exemptions";
import { applyPunishment } from "../security/punish";

/**
 * Message security pipeline: phishing → invites → links → mention flood →
 * duplicate flood → message rate. Exemptions are checked before any action, and
 * every failure is contained so a bad message can never crash the gateway.
 */
export const event = defineEvent({
  name: "messageCreate",
  execute: async (client, message) => {
    if (!message.inGuild() || message.author.bot || message.system) return;

    try {
      const guild = message.guild;
      const member =
        message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
      if (!member) return;
      if (!(await client.modules.isEnabled(guild.id, "SECURITY"))) return;

      const snapshot = await client.security.snapshot(guild.id);
      const settings = snapshot.settings;

      const verdict = client.spamDetector.record(
        {
          guildId: guild.id,
          channelId: message.channelId,
          userId: message.author.id,
          content: message.content,
          mentionCount: message.mentions.users.size,
          now: Date.now(),
        },
        settings,
        snapshot.whitelist,
      );
      if (!verdict) return;

      const exempt = isExempt(subjectFromMember(member), {
        guildOwnerId: guild.ownerId,
        botUserId: client.user?.id ?? null,
        ownerIds: client.owners,
        whitelist: snapshot.whitelist,
        channelId: message.channelId,
        exemptStaff: true,
      });
      if (exempt) return;

      const result = await applyPunishment({
        punishment: verdict.action,
        reason: verdict.reason,
        member,
        message,
        logger: client.logger,
        scope: "message",
      });

      const threat = {
        type: verdict.type,
        severity: verdict.severity,
        actorId: member.id,
        channelId: message.channelId,
        messageId: message.id,
        reason: verdict.reason,
        evidence: verdict.evidence,
        actionTaken: result.description,
      };

      await client.security.recordThreat({
        guildId: guild.id,
        ...threat,
        details: { evidence: verdict.evidence, applied: result.applied },
      });
      await client.security.audit({
        guildId: guild.id,
        actorId: client.user?.id ?? "system",
        actorType: "BOT",
        action: `security.${verdict.type.toLowerCase()}`,
        targetType: "User",
        targetId: member.id,
        reason: verdict.reason,
        after: { actionTaken: result.description, evidence: verdict.evidence },
      });

      client.logger.warn(
        {
          guildId: guild.id,
          channelId: message.channelId,
          userId: member.id,
          type: verdict.type,
          action: result.description,
        },
        "message security rule triggered",
      );

      if (client.securityThrottle.allow(`${guild.id}:${verdict.type}:${member.id}`, Date.now())) {
        await sendSecurityAlert({ guild, settings, threat, logger: client.logger });
      }
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: message.guildId, messageId: message.id },
        "message security handler failed",
      );
    }
  },
});
