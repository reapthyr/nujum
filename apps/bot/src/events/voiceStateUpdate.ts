import { serializeError } from "../lib/errors";
import { defineEvent } from "./types";

/**
 * Join-to-Create lifecycle. Configuration, ownership and per-user cooldowns
 * are enforced by `JtcService`; this listener only forwards gateway state and
 * swallows every failure so one bad room cannot take down the event loop.
 */
export const event = defineEvent({
  name: "voiceStateUpdate",
  execute: async (client, oldState, newState) => {
    const guild = newState.guild ?? oldState.guild;
    try {
      const joined = newState.channelId !== null && newState.channelId !== oldState.channelId;
      if (joined && newState.channelId) {
        const settings = await client.jtc.settings(guild.id);
        if (!settings.enabled || newState.channelId !== settings.generatorChannelId) return;
        const member =
          newState.member ?? (await guild.members.fetch(newState.id).catch(() => null));
        if (!member || member.user.bot) return;
        await client.jtc.createRoom(guild, member);
      }

      if (oldState.channelId && oldState.channelId !== newState.channelId) {
        await client.jtc.cleanupRoom(guild, oldState.channelId);
      }
    } catch (error) {
      client.logger.error(
        { err: serializeError(error), guildId: guild.id, userId: newState.id },
        "voiceStateUpdate JTC handler failed",
      );
    }
  },
});
