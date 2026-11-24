import { queuedBotActionSchema, type QueueDrainResult } from "@nujum/shared";
import { getPrisma, type Prisma } from "@nujum/shared/prisma";
import { serializeError } from "../lib/errors";
import type { BotLogger } from "../lib/logger";
import { ApiActionError, type LiveActions } from "./live-actions";

interface ClaimedAction {
  id: string;
  guildId: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  createdBy: string;
}

export interface QueueService {
  drain(limit: number): Promise<QueueDrainResult>;
  depth(): Promise<number>;
}

/** Idempotent drain of dashboard actions queued while the bot was offline. */
export class DatabaseQueueService implements QueueService {
  constructor(
    private readonly actions: LiveActions,
    private readonly logger: BotLogger,
  ) {}

  async depth(): Promise<number> {
    try {
      return await getPrisma().pendingBotAction.count({ where: { status: "PENDING" } });
    } catch (error) {
      this.logger.warn({ err: serializeError(error) }, "queue depth unavailable");
      return 0;
    }
  }

  async drain(limit: number): Promise<QueueDrainResult> {
    const result: QueueDrainResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
    let rows: ClaimedAction[];
    try {
      rows = await getPrisma().$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<ClaimedAction[]>`
          SELECT "id", "guildId", "type", "payload", "attempts", "createdBy"
          FROM "PendingBotAction"
          WHERE "status" = 'PENDING'::"PendingActionStatus"
          ORDER BY "createdAt" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `;
        if (claimed.length === 0) return [];
        await tx.pendingBotAction.updateMany({
          where: { id: { in: claimed.map((row) => row.id) }, status: "PENDING" },
          data: { status: "PROCESSING", attempts: { increment: 1 } },
        });
        return claimed;
      });
    } catch (error) {
      this.logger.warn({ err: serializeError(error) }, "queue claim failed");
      return result;
    }

    result.claimed = rows.length;
    for (const row of rows) {
      const parsed = queuedBotActionSchema.safeParse({ type: row.type, payload: row.payload });
      if (!parsed.success) {
        result.skipped += 1;
        await this.finish(row.id, "FAILED", "Queued payload failed validation");
        continue;
      }

      const action = parsed.data;
      try {
        switch (action.type) {
          case "SEND_MESSAGE":
            await this.actions.sendMessage(row.guildId, action.payload, row.createdBy);
            break;
          case "ANNOUNCEMENT":
            await this.actions.announcement(row.guildId, action.payload, row.createdBy);
            break;
          case "PUBLISH_VERIFICATION_PANEL":
            await this.actions.publishVerificationPanel(row.guildId, action.payload, row.createdBy);
            break;
          case "SET_LOCKDOWN":
            await this.actions.setLockdown(row.guildId, action.payload, row.createdBy);
            break;
        }
        result.sent += 1;
        await this.finish(row.id, "SENT", null);
      } catch (error) {
        // Unknown channel/guild means the desired end state already exists.
        if (
          error instanceof ApiActionError &&
          ["NOT_FOUND", "GUILD_NOT_FOUND"].includes(error.code)
        ) {
          result.sent += 1;
          await this.finish(row.id, "SENT", null);
          continue;
        }
        result.failed += 1;
        const message = error instanceof ApiActionError ? error.message : "Live action failed";
        await this.finish(row.id, "FAILED", message.slice(0, 300));
        this.logger.warn(
          { err: serializeError(error), actionId: row.id, type: row.type },
          "queued bot action failed",
        );
      }
    }
    return result;
  }

  private async finish(id: string, status: "SENT" | "FAILED", error: string | null): Promise<void> {
    try {
      await getPrisma().pendingBotAction.update({
        where: { id },
        data: { status, lastError: error, processedAt: new Date() },
      });
    } catch (updateError) {
      this.logger.error(
        { err: serializeError(updateError), actionId: id },
        "failed to finalize queued action",
      );
    }
  }
}
