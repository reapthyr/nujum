import { ChannelType, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import {
  VERIFICATION_MODES,
  WHITELIST_TYPES,
  securityWhitelistEntrySchema,
  snowflakeSchema,
  zEnum,
} from "@nujum/shared";
import type { SecuritySettings } from "../../security/types";
import { assertPermissions } from "../../lib/permissions";
import { baseEmbed, truncate } from "../../lib/embeds";
import { serializeError, toUserMessage } from "../../lib/errors";
import { activateLockdown, deactivateLockdown } from "../../security/lockdown";
import { verificationPanel } from "../../security/verification/views";
import { defineCommand, withScope } from "../types";

type BooleanSetting = {
  [K in keyof SecuritySettings]: SecuritySettings[K] extends boolean ? K : never;
}[keyof SecuritySettings];

const TOGGLES = {
  raid: "antiRaidEnabled",
  nuke: "antiNukeEnabled",
  spam: "antiSpamEnabled",
  invites: "inviteFilterEnabled",
  links: "linkFilterEnabled",
  phishing: "phishingDetection",
  lockdown: "autoLockdown",
} as const satisfies Record<string, BooleanSetting>;

const PROTECTION_CHOICES = Object.keys(TOGGLES).map((key) => ({ name: key, value: key }));
const WHITELIST_CHOICES = WHITELIST_TYPES.map((value) => ({ name: value.toLowerCase(), value }));
const MODE_CHOICES = VERIFICATION_MODES.map((value) => ({ name: value.toLowerCase(), value }));

function bool(value: boolean): string {
  return value ? "✅" : "❌";
}

export const command = defineCommand({
  name: "security",
  data: withScope(
    new SlashCommandBuilder()
      .setName("security")
      .setDescription("View or toggle security protections.")
      .addSubcommand((sub) =>
        sub.setName("status").setDescription("Show the current security configuration."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("toggle")
          .setDescription("Enable or disable one protection.")
          .addStringOption((option) =>
            option
              .setName("protection")
              .setDescription("Protection to change")
              .setRequired(true)
              .addChoices(...PROTECTION_CHOICES),
          )
          .addBooleanOption((option) =>
            option.setName("enabled").setDescription("Enabled or disabled").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("lockdown")
          .setDescription("Activate or lift a server lockdown.")
          .addStringOption((option) =>
            option
              .setName("action")
              .setDescription("activate or lift")
              .setRequired(true)
              .addChoices({ name: "activate", value: "activate" }, { name: "lift", value: "lift" }),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Audit reason").setMaxLength(300),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("whitelist")
          .setDescription("Add or remove a security exemption.")
          .addStringOption((option) =>
            option
              .setName("action")
              .setDescription("add or remove")
              .setRequired(true)
              .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }),
          )
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("Exemption type")
              .setRequired(true)
              .addChoices(...WHITELIST_CHOICES),
          )
          .addStringOption((option) =>
            option
              .setName("value")
              .setDescription("User/role/channel id, domain or invite code")
              .setRequired(true)
              .setMaxLength(253),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("verification")
          .setDescription("Configure or disable member verification.")
          .addStringOption((option) =>
            option
              .setName("action")
              .setDescription("setup, disable or info")
              .setRequired(true)
              .addChoices(
                { name: "setup", value: "setup" },
                { name: "disable", value: "disable" },
                { name: "info", value: "info" },
              ),
          )
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Channel where the verification panel is posted")
              .addChannelTypes(ChannelType.GuildText),
          )
          .addRoleOption((option) => option.setName("role").setDescription("Role to grant"))
          .addStringOption((option) =>
            option
              .setName("mode")
              .setDescription("Verification mode")
              .addChoices(...MODE_CHOICES),
          )
          .addIntegerOption((option) =>
            option
              .setName("min_age")
              .setDescription("Minimum account age in days")
              .setMinValue(0)
              .setMaxValue(365),
          ),
      ),
    "guild",
  ),
  async execute({ interaction, client }) {
    const guild = interaction.guild;
    if (!guild) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const member = await guild.members.fetch(interaction.user.id);
      assertPermissions({ member, channel: null, required: ["ManageGuild"], actor: "user" });

      const subcommand = interaction.options.getSubcommand();
      const settings = await client.security.settings(guild.id);

      if (subcommand === "status") {
        const lockdown = await client.security.lockdown(guild.id);
        const verification = await client.verification.settings(guild.id);
        const embed = baseEmbed({ title: `${guild.name} security` }).addFields(
          {
            name: "Protections",
            value: [
              `Anti-raid ${bool(settings.antiRaidEnabled)} (\`${settings.raidJoinThreshold}\` joins / \`${settings.raidWindowSeconds}\`s → \`${settings.raidAction}\`)`,
              `Anti-nuke ${bool(settings.antiNukeEnabled)} (\`${settings.nukeThreshold}\` / \`${settings.nukeWindowSeconds}\`s)`,
              `Anti-spam ${bool(settings.antiSpamEnabled)} (\`${settings.spamThreshold}\` / \`${settings.spamWindowSeconds}\`s → \`${settings.spamAction}\`)`,
              `Mention limit \`${settings.mentionLimit}\``,
              `Invites ${bool(settings.inviteFilterEnabled)} • Links ${bool(settings.linkFilterEnabled)} • Phishing ${bool(settings.phishingDetection)}`,
              `Auto-lockdown ${bool(settings.autoLockdown)}`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "State",
            value: [
              `Lockdown: ${lockdown.active ? `active (${truncate(lockdown.reason ?? "no reason", 80)})` : "inactive"}`,
              `Verification: ${verification.enabled ? `${verification.mode} → ${verification.roleId ? `<@&${verification.roleId}>` : "no role"}` : "disabled"}`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "Allowed domains",
            value: settings.allowedDomains.length > 0 ? settings.allowedDomains.join(", ") : "none",
            inline: false,
          },
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (subcommand === "toggle") {
        const name = interaction.options.getString("protection", true);
        const enabled = interaction.options.getBoolean("enabled", true);
        const key = TOGGLES[name as keyof typeof TOGGLES];
        if (!key) throw new Error("Unknown protection.");

        await client.security.updateSettings(guild.id, { [key]: enabled }, member.id);
        await interaction.editReply({
          content: `${name} is now **${enabled ? "enabled" : "disabled"}**. Change recorded in the audit log.`,
          embeds: [],
        });
        client.logger.info(
          { guildId: guild.id, userId: member.id, key, enabled },
          "security toggle",
        );
        return;
      }

      if (subcommand === "lockdown") {
        const action = interaction.options.getString("action", true);
        const reason =
          interaction.options.getString("reason") ?? `Manual by ${interaction.user.tag}`;
        if (action === "activate") {
          const result = await activateLockdown(guild, client.security, client.logger, {
            reason,
            activatedBy: member.id,
          });
          await interaction.editReply({
            content: `Lockdown activated on ${result.changed} channel(s). Use \`/security lockdown action:lift\` to restore them.`,
            embeds: [],
          });
        } else {
          const result = await deactivateLockdown(guild, client.security, client.logger, {
            reason,
            actorId: member.id,
          });
          await interaction.editReply({
            content: `Lockdown lifted; ${result.changed} channel(s) restored.`,
            embeds: [],
          });
        }
        return;
      }

      if (subcommand === "whitelist") {
        const action = interaction.options.getString("action", true);
        const type = zEnum(WHITELIST_TYPES).parse(interaction.options.getString("type", true));
        const parsed = securityWhitelistEntrySchema.parse({
          type,
          value: interaction.options.getString("value", true),
        });
        if (
          (type === "USER" || type === "ROLE" || type === "CHANNEL") &&
          !snowflakeSchema.safeParse(parsed.value).success
        ) {
          throw new Error("That exemption requires a Discord ID.");
        }

        if (action === "add") {
          await client.security.addWhitelist(guild.id, type, parsed.value, member.id);
        } else {
          await client.security.removeWhitelist(guild.id, type, parsed.value, member.id);
        }
        await interaction.editReply({
          content: `Whitelist ${action === "add" ? "updated" : "removed"}: \`${parsed.value}\`.`,
          embeds: [],
        });
        return;
      }

      if (subcommand === "verification") {
        const action = interaction.options.getString("action", true);
        const current = await client.verification.settings(guild.id);

        if (action === "info") {
          await interaction.editReply({
            content: [
              `Verification: **${current.enabled ? "enabled" : "disabled"}**`,
              `Mode: \`${current.mode}\` • Min age: \`${current.minAccountAgeDays}\` day(s)`,
              `Channel: ${current.channelId ? `<#${current.channelId}>` : "none"} • Role: ${current.roleId ? `<@&${current.roleId}>` : "none"}`,
            ].join("\n"),
            embeds: [],
          });
          return;
        }

        if (action === "disable") {
          await client.verification.saveSettings(guild.id, { enabled: false }, member.id);
          await client.modules.setEnabled(guild.id, "VERIFICATION", false, member.id);
          await client.security.audit({
            guildId: guild.id,
            actorId: member.id,
            actorType: "USER",
            action: "verification.disable",
            targetType: "Guild",
            targetId: guild.id,
            before: { enabled: current.enabled },
            after: { enabled: false },
          });
          await interaction.editReply({ content: "Verification disabled.", embeds: [] });
          return;
        }

        const selectedChannel = interaction.options.getChannel("channel", true);
        const selectedRole = interaction.options.getRole("role", true);
        // Option results can be raw API objects; re-fetch to get full guild objects.
        const panelChannel = await guild.channels.fetch(selectedChannel.id).catch(() => null);
        const targetRole = await guild.roles.fetch(selectedRole.id).catch(() => null);
        if (
          !panelChannel ||
          !panelChannel.isTextBased() ||
          !("send" in panelChannel) ||
          !targetRole
        ) {
          throw new Error("Select a text channel and a role that still exist.");
        }
        if (
          !guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
          !targetRole.editable ||
          member.roles.highest.position <= targetRole.position ||
          guild.members.me.roles.highest.position <= targetRole.position
        ) {
          throw new Error("I need Manage Roles and the role must be below both our highest roles.");
        }

        const mode = zEnum(VERIFICATION_MODES).parse(
          interaction.options.getString("mode") ?? current.mode,
        );
        const minAge = interaction.options.getInteger("min_age") ?? current.minAccountAgeDays;
        const next = await client.verification.saveSettings(
          guild.id,
          {
            enabled: true,
            mode,
            channelId: panelChannel.id,
            roleId: targetRole.id,
            minAccountAgeDays: minAge,
          },
          member.id,
        );
        await client.modules.setEnabled(guild.id, "VERIFICATION", true, member.id);
        await client.security.audit({
          guildId: guild.id,
          actorId: member.id,
          actorType: "USER",
          action: "verification.setup",
          targetType: "Guild",
          targetId: guild.id,
          before: current,
          after: next,
        });

        const panel = verificationPanel(next, guild.id, guild.ownerId);
        if (
          !panelChannel
            .permissionsFor(guild.members.me ?? member)
            ?.has(["ViewChannel", "SendMessages", "EmbedLinks"])
        ) {
          throw new Error("I cannot send messages in that channel.");
        }
        await panelChannel.send({ ...panel, allowedMentions: { parse: [] } });
        await interaction.editReply({
          content: `Verification panel posted in <#${panelChannel.id}>. New members will receive the \`${mode}\` flow.`,
          embeds: [],
        });
        return;
      }

      throw new Error("Unknown subcommand.");
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: interaction.user.id },
        "/security failed",
      );
      await interaction
        .editReply({
          content: truncate(toUserMessage(error), 300),
          embeds: [],
        })
        .catch(() => undefined);
    }
  },
});
