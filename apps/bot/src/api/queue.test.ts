import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@nujum/shared/prisma";
import type { BotLogger } from "../lib/logger";
import { ApiActionError, type LiveActions } from "./live-actions";
import { DatabaseQueueService } from "./queue";

const GUILD = "123456789012345678";
const ACTOR = "987654321098765432";
const logger = pino({ level: "silent" }) as unknown as BotLogger;

interface FakeRow {
  id: string;
  guildId: string;
  type: string;
  payload: unknown;
  attempts: number;
  createdBy: string;
}

/** Injects a partial Prisma client through the shared singleton; no vi.mock. */
function installQueueStore(rows: FakeRow[]): {
  restore: () => void;
  finalize: ReturnType<typeof vi.fn>;
} {
  const globalStore = globalThis as unknown as { __nujumPrisma?: PrismaClient };
  const previous = globalStore.__nujumPrisma;
  const finalize = vi.fn(() => Promise.resolve({ id: "action-1" }));
  globalStore.__nujumPrisma = {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: () => Promise.resolve(rows),
        pendingBotAction: { updateMany: () => Promise.resolve({ count: rows.length }) },
      }),
    pendingBotAction: { update: finalize },
  } as unknown as PrismaClient;
  return {
    finalize,
    restore: () => {
      globalStore.__nujumPrisma = previous;
    },
  };
}

function row(type: string, payload: unknown): FakeRow {
  return {
    id: "action-1",
    guildId: GUILD,
    type,
    payload,
    attempts: 0,
    createdBy: ACTOR,
  };
}

describe("queue action switch", () => {
  afterEach(() => {
    const globalStore = globalThis as unknown as { __nujumPrisma?: PrismaClient };
    globalStore.__nujumPrisma = undefined;
  });

  it("dispatches PUBLISH_TICKET_PANEL to the ticket panel live action", async () => {
    const store = installQueueStore([
      row("PUBLISH_TICKET_PANEL", { channelId: "111111111111111111", preview: true }),
    ]);
    const publishTicketPanel = vi.fn(() =>
      Promise.resolve({
        type: "PUBLISH_TICKET_PANEL" as const,
        status: "SENT" as const,
      }),
    );
    const actions = { publishTicketPanel } as unknown as LiveActions;
    try {
      const result = await new DatabaseQueueService(actions, logger).drain(5);
      expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
      expect(publishTicketPanel).toHaveBeenCalledWith(
        GUILD,
        { channelId: "111111111111111111", preview: false },
        ACTOR,
      );
      expect(store.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }),
      );
    } finally {
      store.restore();
    }
  });

  it("treats a missing guild as an already satisfied queued panel publish", async () => {
    const store = installQueueStore([row("PUBLISH_TICKET_PANEL", {})]);
    const publishTicketPanel = vi.fn(() =>
      Promise.reject(new ApiActionError("GUILD_NOT_FOUND", "The bot is not in that guild.", 404)),
    );
    const actions = { publishTicketPanel } as unknown as LiveActions;
    try {
      const result = await new DatabaseQueueService(actions, logger).drain(5);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
    } finally {
      store.restore();
    }
  });

  it("skips queued payloads that fail shared validation", async () => {
    const store = installQueueStore([row("PUBLISH_TICKET_PANEL", { preview: "yes" })]);
    const publishTicketPanel = vi.fn(() =>
      Promise.resolve({
        type: "PUBLISH_TICKET_PANEL" as const,
        status: "SENT" as const,
      }),
    );
    const actions = { publishTicketPanel } as unknown as LiveActions;
    try {
      const result = await new DatabaseQueueService(actions, logger).drain(5);
      expect(result.skipped).toBe(1);
      expect(publishTicketPanel).not.toHaveBeenCalled();
    } finally {
      store.restore();
    }
  });
});
