"use server";

import { revalidatePath } from "next/cache";
import {
  announcementBodySchema,
  lockdownBodySchema,
  publishTicketPanelBodySchema,
  publishVerificationBodySchema,
  queuedBotActionSchema,
  sendMessageBodySchema,
  type QueuedBotActionType,
} from "@nujum/shared";
import { getPrisma } from "@nujum/shared/prisma";
import { createBotClient } from "../../lib/bot-client";
import type { BotResponse, LiveActionOutcome } from "../../lib/live-types";
import { getAuditContext, toInputJson, type AuditContext } from "../../lib/config-writes";
import { guardGuildAction } from "../../lib/guards";
import { SecurityError, toActionResult, type ActionResult } from "../../lib/http";
import { assertSensitive } from "../../lib/session";
import type { BotActionResult } from "@nujum/shared";

async function queueAction(
  context: AuditContext,
  type: QueuedBotActionType,
  payload: unknown,
): Promise<void> {
  const parsed = queuedBotActionSchema.safeParse({ type, payload });
  if (!parsed.success) throw new SecurityError("That action cannot be queued.", "BAD_REQUEST");
  await getPrisma().$transaction(async (tx) => {
    const queued = await tx.pendingBotAction.create({
      data: {
        guildId: context.guildId,
        type: parsed.data.type,
        payload: toInputJson(parsed.data.payload),
        createdBy: context.actorDiscordId,
        status: "PENDING",
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        guildId: context.guildId,
        actorId: context.actorId,
        actorType: "DASHBOARD",
        action: `bot.action.queued.${parsed.data.type}`,
        targetType: "PendingBotAction",
        targetId: queued.id,
        after: toInputJson({ type: parsed.data.type, status: "PENDING" }),
        ...(context.ip ? { ip: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        ...(context.requestId ? { requestId: context.requestId } : {}),
      },
    });
  });
  revalidatePath(`/dashboard/${context.guildId}/queue`);
}

function outcome(response: BotResponse<BotActionResult>): ActionResult<LiveActionOutcome> {
  if (response.ok && response.data) {
    return {
      ok: true,
      data: {
        status: "SENT",
        ...(response.requestId ? { requestId: response.requestId } : {}),
        ...(response.data.messageId ? { messageId: response.data.messageId } : {}),
      },
    };
  }
  return {
    ok: false,
    error: response.error ?? "The bot rejected the action.",
    code: response.code ?? "BOT_ERROR",
  };
}

async function runLiveAction<T>(
  guildId: string,
  operation: string,
  rawInput: unknown,
  schema: { safeParse(value: unknown): { success: false } | { success: true; data: T } },
  type: QueuedBotActionType,
  call: (
    client: ReturnType<typeof createBotClient>,
    input: T,
  ) => Promise<BotResponse<BotActionResult>>,
): Promise<ActionResult<LiveActionOutcome>> {
  try {
    const ctx = await guardGuildAction(guildId, operation);
    await assertSensitive(ctx);
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) throw new SecurityError("Invalid action payload.", "BAD_REQUEST");
    const context = await getAuditContext(guildId, ctx.session);
    const response = await call(createBotClient(ctx.session.user.discordId), parsed.data);
    if (response.offline) {
      await queueAction(context, type, parsed.data);
      return { ok: true, data: { status: "QUEUED" } };
    }
    return outcome(response);
  } catch (error) {
    return toActionResult(error);
  }
}

export async function sendMessageAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<LiveActionOutcome>> {
  return runLiveAction(
    guildId,
    "live.message",
    input,
    sendMessageBodySchema,
    "SEND_MESSAGE",
    (client, payload) => client.sendMessage(guildId, payload),
  );
}

export async function sendAnnouncementAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<LiveActionOutcome>> {
  return runLiveAction(
    guildId,
    "live.announcement",
    input,
    announcementBodySchema,
    "ANNOUNCEMENT",
    (client, payload) => client.sendAnnouncement(guildId, payload),
  );
}

export async function publishVerificationPanelAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<LiveActionOutcome>> {
  return runLiveAction(
    guildId,
    "live.panel",
    input,
    publishVerificationBodySchema,
    "PUBLISH_VERIFICATION_PANEL",
    (client, payload) => client.publishVerificationPanel(guildId, payload),
  );
}

export async function publishTicketPanelAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<LiveActionOutcome>> {
  return runLiveAction(
    guildId,
    "live.ticket.panel",
    input,
    publishTicketPanelBodySchema,
    "PUBLISH_TICKET_PANEL",
    (client, payload) => client.publishTicketPanel(guildId, payload),
  );
}

export async function setLockdownAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<LiveActionOutcome>> {
  return runLiveAction(
    guildId,
    "live.lockdown",
    input,
    lockdownBodySchema,
    "SET_LOCKDOWN",
    (client, payload) => client.setLockdown(guildId, payload),
  );
}

export async function drainQueueAction(guildId: string): Promise<ActionResult> {
  try {
    const ctx = await guardGuildAction(guildId, "queue.drain");
    await assertSensitive(ctx);
    const response = await createBotClient(ctx.session.user.discordId).drainQueue(25);
    if (!response.ok) {
      return {
        ok: false,
        error: response.error ?? "The queue could not be drained.",
        code: response.code ?? "BOT_ERROR",
      };
    }
    revalidatePath(`/dashboard/${guildId}/queue`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function cancelQueuedAction(guildId: string, actionId: string): Promise<ActionResult> {
  try {
    const ctx = await guardGuildAction(guildId, "queue.cancel");
    await assertSensitive(ctx);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(actionId)) {
      throw new SecurityError("Invalid queue entry id.", "BAD_REQUEST");
    }
    const context = await getAuditContext(guildId, ctx.session);
    const updated = await getPrisma().pendingBotAction.updateMany({
      where: { id: actionId, guildId, status: "PENDING" },
      data: { status: "CANCELLED", processedAt: new Date(), lastError: "Cancelled from dashboard" },
    });
    if (updated.count === 0)
      throw new SecurityError("That action is no longer pending.", "BAD_REQUEST");
    await getPrisma().auditLog.create({
      data: {
        guildId,
        actorId: ctx.session.user.id,
        actorType: "DASHBOARD",
        action: "bot.action.cancelled",
        targetType: "PendingBotAction",
        targetId: actionId,
        ...(context.ip ? { ip: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });
    revalidatePath(`/dashboard/${guildId}/queue`);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionResult(error);
  }
}
