import { ChannelType, MessageFlags, SlashCommandBuilder, type GuildBasedChannel } from "discord.js";
import { JTC_ACTIONS, jtcActionSchema, jtcPresetSchema } from "@nujum/shared";
import { baseEmbed, truncate } from "../../lib/embeds";
import { serializeError, toUserMessage } from "../../lib/errors";
import type { JtcPanelSendChannel } from "../../jtc/service";
import { defineCommand, withScope } from "../types";

function sendChannel(channel: unknown): JtcPanelSendChannel | undefined {
  if (!channel || typeof channel !== "object") return undefined;
  const candidate = channel as GuildBasedChannel & {
    send?: JtcPanelSendChannel["send"];
    permissionsFor?: JtcPanelSendChannel["permissionsFor"];
  };
  if (
    !candidate.isTextBased() ||
    typeof candidate.send !== "function" ||
    typeof candidate.permissionsFor !== "function"
  ) {
    return undefined;
  }
  return candidate;
}

export const command = defineCommand({
  name: "jtc",
  data: withScope(
    new SlashCommandBuilder()
      .setName("jtc")
      .setDescription("Manage your Join-to-Create room, preset and trusted members.")
      .addSubcommand((sub) =>
        sub
          .setName("preset")
          .setDescription("Save, list or delete a room preset.")
          .addStringOption((option) =>
            option
              .setName("action")
              .setDescription("Preset action")
              .setRequired(true)
              .addChoices(
                { name: "save", value: "save" },
                { name: "list", value: "list" },
                { name: "delete", value: "delete" },
              ),
          )
          .addStringOption((option) =>
            option.setName("name").setDescription("Preset name").setMaxLength(32),
          )
          .addBooleanOption((option) => option.setName("locked").setDescription("Start locked"))
          .addBooleanOption((option) => option.setName("hidden").setDescription("Start hidden"))
          .addIntegerOption((option) =>
            option
              .setName("limit")
              .setDescription("Voice user limit")
              .setMinValue(0)
              .setMaxValue(99),
          )
          .addIntegerOption((option) =>
            option
              .setName("bitrate")
              .setDescription("Bitrate in kbps")
              .setMinValue(8)
              .setMaxValue(384),
          )
          .addStringOption((option) =>
            option
              .setName("region")
              .setDescription("Voice region (auto or region id)")
              .setMaxLength(32),
          )
          .addBooleanOption((option) => option.setName("default").setDescription("Use as default")),
      )
      .addSubcommand((sub) =>
        sub
          .setName("action")
          .setDescription("Change your Join-to-Create room.")
          .addStringOption((option) =>
            option
              .setName("action")
              .setDescription("Room action")
              .setRequired(true)
              .addChoices(...JTC_ACTIONS.map((value) => ({ name: value.toLowerCase(), value }))),
          )
          .addUserOption((option) => option.setName("user").setDescription("Target member"))
          .addStringOption((option) =>
            option.setName("name").setDescription("New room name").setMaxLength(80),
          )
          .addIntegerOption((option) =>
            option
              .setName("value")
              .setDescription("Limit or bitrate value")
              .setMinValue(0)
              .setMaxValue(384),
          )
          .addStringOption((option) =>
            option
              .setName("region")
              .setDescription("Voice region (auto or region id)")
              .setMaxLength(32),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("panel")
          .setDescription("Publish the Join-to-Create control panel.")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Panel channel (defaults to the configured interface channel)")
              .addChannelTypes(ChannelType.GuildText),
          ),
      )
      .addSubcommand((sub) => sub.setName("stats").setDescription("Show your JTC room stats.")),
    "guild",
  ),
  async execute({ interaction, client, logger }) {
    const guild = interaction.guild;
    if (!guild) return;
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const userId = interaction.user.id;

      if (subcommand === "stats") {
        const stats = await client.jtc.stats(guild.id, userId);
        await interaction.editReply({
          embeds: [
            baseEmbed({ title: "Join-to-Create stats" }).setDescription(
              `Rooms: **${stats.rooms}** • Presets: **${stats.presets}**`,
            ),
          ],
        });
        return;
      }

      if (subcommand === "preset") {
        const action = interaction.options.getString("action", true);
        const name = interaction.options.getString("name");
        if (action === "list") {
          const presets = await client.jtc.listPresets(guild.id, userId);
          await interaction.editReply({
            embeds: [
              baseEmbed({
                title: "Your JTC presets",
                description:
                  presets.length === 0
                    ? "You have no saved presets."
                    : presets
                        .map(
                          (preset) =>
                            `\`${preset.name}\`${preset.isDefault ? " (default)" : ""} — limit ${preset.userLimit}, bitrate ${preset.bitrate}, ${preset.locked ? "locked" : "unlocked"}`,
                        )
                        .join("\n"),
              }),
            ],
          });
          return;
        }
        if (action === "delete") {
          if (!name) throw new Error("Provide the preset name to delete.");
          await client.jtc.deletePreset(guild.id, userId, name);
          await interaction.editReply({ content: `Deleted preset \`${name}\`.`, embeds: [] });
          return;
        }
        const preset = jtcPresetSchema.parse({
          name,
          locked: interaction.options.getBoolean("locked") ?? false,
          hidden: interaction.options.getBoolean("hidden") ?? false,
          userLimit: interaction.options.getInteger("limit") ?? 0,
          bitrate: interaction.options.getInteger("bitrate") ?? 64,
          region: interaction.options.getString("region") ?? null,
          isDefault: interaction.options.getBoolean("default") ?? false,
        });
        await client.jtc.savePreset(guild, userId, preset);
        await interaction.editReply({ content: `Saved preset \`${preset.name}\`.`, embeds: [] });
        return;
      }

      if (subcommand === "action") {
        const raw = {
          action: interaction.options.getString("action", true),
          ...(interaction.options.getUser("user")
            ? { userId: interaction.options.getUser("user", true).id }
            : {}),
          ...(interaction.options.getString("name")
            ? { name: interaction.options.getString("name", true) }
            : {}),
          ...(interaction.options.getInteger("value") !== null
            ? { value: interaction.options.getInteger("value", true) }
            : {}),
          ...(interaction.options.getString("region")
            ? { region: interaction.options.getString("region", true) }
            : {}),
        };
        const validated = jtcActionSchema.parse(raw);
        const result = await client.jtc.applyAction(guild, userId, validated);
        await interaction.editReply({
          embeds: [
            baseEmbed({
              title: "Room updated",
              description: truncate(result.detail ?? `${validated.action} applied.`, 300),
            }),
          ],
        });
        return;
      }

      if (subcommand === "panel") {
        const channel = interaction.options.getChannel("channel");
        const result = await client.jtc.publishPanel(guild.id, userId, {
          guild,
          ...(channel ? { channel: sendChannel(channel) } : {}),
        });
        await interaction.editReply({
          embeds: [
            baseEmbed({
              title: "JTC panel published",
              description: truncate(`Message: ${result.messageId} in <#${result.channelId}>.`, 200),
            }),
          ],
        });
        return;
      }

      throw new Error("Unknown subcommand.");
    } catch (error) {
      logger.error({ err: serializeError(error), guildId: guild.id, subcommand }, "/jtc failed");
      await interaction
        .editReply({ content: truncate(toUserMessage(error), 300), embeds: [] })
        .catch(() => undefined);
    }
  },
});
