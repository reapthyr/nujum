import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild } from "discord.js";
import { buildCustomId } from "../lib/components";
import { baseEmbed, truncate } from "../lib/embeds";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";
import type { SecuritySettings, ThreatRecord } from "./types";

export interface SecurityAlert {
  guild: Guild;
  settings: SecuritySettings;
  threat: ThreatRecord & { evidence?: string };
  logger: BotLogger;
  /** Adds a guild-bound unlock button whose caller is re-checked in code. */
  lockdownActive?: boolean;
}

function severityLabel(severity: 1 | 2 | 3): string {
  if (severity >= 3) return "Critical";
  if (severity === 2) return "High";
  return "Low";
}

/**
 * Sends a security alert to the configured channel, falling back to the system
 * channel and then the guild owner's DMs. Never pings anyone.
 */
export async function sendSecurityAlert(alert: SecurityAlert): Promise<void> {
  const { guild, settings, threat, logger } = alert;

  const embed = baseEmbed({
    title: `Security alert • ${threat.type.replaceAll("_", " ").toLowerCase()}`,
    description: truncate(threat.reason ?? "A security rule was triggered.", 1_000),
    color: threat.severity >= 3 ? 0xef4444 : threat.severity === 2 ? 0xf59e0b : 0x8b5cf6,
  }).addFields(
    { name: "Severity", value: severityLabel(threat.severity), inline: true },
    { name: "Actor", value: threat.actorId ? `\`${threat.actorId}\`` : "Unknown", inline: true },
    {
      name: "Action taken",
      value: truncate(threat.actionTaken ?? "Alert only", 200),
      inline: true,
    },
  );

  if (threat.channelId) {
    embed.addFields({ name: "Channel", value: `\`${threat.channelId}\``, inline: true });
  }
  if (threat.evidence) {
    embed.addFields({ name: "Evidence", value: truncate(threat.evidence, 300), inline: false });
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (alert.lockdownActive === true) {
    const unlock = new ButtonBuilder()
      .setCustomId(
        buildCustomId({
          module: "security",
          action: "unlock",
          guildId: guild.id,
          userId: guild.ownerId,
        }),
      )
      .setLabel("Lift lockdown")
      .setStyle(ButtonStyle.Danger);
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(unlock));
  }

  const payload = {
    embeds: [embed],
    components,
    allowedMentions: { parse: [] as [] },
  };

  const configured = settings.alertChannelId
    ? guild.channels.cache.get(settings.alertChannelId)
    : undefined;
  const channel =
    configured?.isTextBased() === true
      ? configured
      : guild.systemChannel?.isTextBased() === true
        ? guild.systemChannel
        : undefined;

  if (channel) {
    try {
      await channel.send(payload);
      return;
    } catch (error) {
      logger.warn(
        { err: serializeError(error), guildId: guild.id, channelId: channel.id },
        "security alert channel failed; falling back to owner DM",
      );
    }
  }

  try {
    const owner = await guild.fetchOwner();
    await owner.send(payload);
  } catch (error) {
    logger.warn(
      { err: serializeError(error), guildId: guild.id },
      "could not deliver security alert",
    );
  }
}
