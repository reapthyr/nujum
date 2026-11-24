import { describe, expect, it, vi } from "vitest";
import {
  jtcConfigSchema,
  ticketCategoryDeleteInputSchema,
  ticketCategoryInputSchema,
  ticketCategoryUpdateInputSchema,
  ticketConfigSchema,
} from "@nujum/shared";
import {
  AUDIT_ACTIONS,
  createTicketCategory,
  deleteTicketCategory,
  revertAuditEntry,
  updateTicketCategory,
  writeJtcConfig,
  writeTicketConfig,
  type AuditContext,
} from "./config-writes";
import { SecurityError, toActionResult } from "./http";

const GUILD_ID = "123456789012345678";
const context: AuditContext = {
  guildId: GUILD_ID,
  actorId: "user-1",
  actorDiscordId: "987654321098765432",
};

const TICKET_RAW = {
  enabled: true,
  panelChannelId: "222222222222222222",
  transcriptChannelId: null,
  logChannelId: null,
  supportRoleIds: ["333333333333333333"],
  maxOpenPerUser: 2,
  inactivityHours: 48,
  warnBeforeHours: 6,
  namingFormat: "ticket-{number}",
  ratingEnabled: true,
};

const JTC_RAW = {
  enabled: true,
  generatorChannelId: "222222222222222222",
  categoryId: null,
  nameTemplate: "{username}'s room",
  defaultLimit: 0,
  defaultBitrate: 64,
  defaultRegion: "auto",
  panelChannelId: null,
  interfaceChannelId: null,
  trustedRoleIds: ["333333333333333333"],
};

const CATEGORY_RAW = {
  name: "Support",
  emoji: "🎫",
  description: "General help",
  discordCategoryId: null,
  supportRoleIds: ["333333333333333333"],
  formFields: [{ key: "details", label: "Details", required: true, style: "SHORT" }],
  position: 2,
  enabled: true,
};

/** The mock transaction is injected per test; no Prisma client or database is created. */
const harness: { tx: unknown } = vi.hoisted(() => ({ tx: undefined }));

vi.mock("@nujum/shared/prisma", () => ({
  getPrisma: () => ({
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(harness.tx),
  }),
  Prisma: { JsonNull: "JsonNull" },
}));

interface FakeOptions {
  ticketBefore?: unknown;
  jtcBefore?: unknown;
  categoryBefore?: unknown;
  auditEntry?: unknown;
}

function fakeTx(options: FakeOptions = {}) {
  const auditRows: unknown[] = [];
  let generatedId = 0;
  const upsert = ({
    create,
    update,
  }: {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) => Promise.resolve({ ...create, ...update, guildId: GUILD_ID });
  return {
    ticketConfig: {
      findUnique: vi.fn(() => Promise.resolve(options.ticketBefore ?? null)),
      upsert: vi.fn(upsert),
    },
    jtcConfig: {
      findUnique: vi.fn(() => Promise.resolve(options.jtcBefore ?? null)),
      upsert: vi.fn(upsert),
    },
    ticketCategory: {
      findFirst: vi.fn(() => Promise.resolve(options.categoryBefore ?? null)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          id: typeof data.id === "string" ? data.id : `cat-${(generatedId += 1)}`,
        }),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, id: "cat-1" }),
      ),
      delete: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    auditLog: {
      create: vi.fn(({ data }: { data: unknown }) => {
        auditRows.push(data);
        return Promise.resolve({ id: "audit-new" });
      }),
      findFirst: vi.fn(() => Promise.resolve(options.auditEntry ?? null)),
      update: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    guild: { update: vi.fn(() => Promise.resolve({ configVersion: 7 })) },
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    auditRows,
  };
}

function auditEntry(overrides: Record<string, unknown>) {
  return {
    id: "audit-1",
    guildId: GUILD_ID,
    actorId: context.actorId,
    actorType: "DASHBOARD",
    action: AUDIT_ACTIONS.ticketCategoryUpdate,
    targetType: "TicketCategory",
    targetId: "cat-1",
    before: null,
    after: null,
    revertedAt: null,
    ...overrides,
  };
}

describe("ticket and JTC contract validation", () => {
  it("accepts valid configs and rejects malformed templates and regions", () => {
    expect(ticketConfigSchema.safeParse(TICKET_RAW).success).toBe(true);
    expect(ticketConfigSchema.safeParse({ ...TICKET_RAW, namingFormat: "support" }).success).toBe(
      false,
    );
    expect(jtcConfigSchema.safeParse(JTC_RAW).success).toBe(true);
    expect(jtcConfigSchema.safeParse({ ...JTC_RAW, nameTemplate: "My room" }).success).toBe(false);
    expect(jtcConfigSchema.safeParse({ ...JTC_RAW, defaultRegion: "mars-1" }).success).toBe(false);
  });

  it("validates category ids and unique form field keys", () => {
    expect(ticketCategoryInputSchema.safeParse(CATEGORY_RAW).success).toBe(true);
    const duplicate = {
      ...CATEGORY_RAW,
      formFields: [
        { key: "details", label: "One" },
        { key: "details", label: "Two" },
      ],
    };
    expect(ticketCategoryInputSchema.safeParse(duplicate).success).toBe(false);
    expect(ticketCategoryUpdateInputSchema.safeParse({ ...CATEGORY_RAW, id: "" }).success).toBe(
      false,
    );
    expect(ticketCategoryDeleteInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("ticket and JTC config writers", () => {
  it("writes ticket config with a full audit image and config notification", async () => {
    const tx = fakeTx({ ticketBefore: { guildId: GUILD_ID, enabled: false } });
    harness.tx = tx;
    const result = await writeTicketConfig(context, TICKET_RAW);
    expect(result.version).toBe(7);
    expect(result.changed).toContain("enabled");
    expect(tx.ticketConfig.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditRows).toHaveLength(1);
    expect(tx.auditRows[0]).toMatchObject({
      action: "tickets.config.update",
      targetType: "TicketConfig",
      targetId: GUILD_ID,
      before: { guildId: GUILD_ID, enabled: false },
      after: expect.objectContaining({ namingFormat: "ticket-{number}" }),
    });
    expect(tx.guild.update).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("writes JTC config with its own audit action", async () => {
    const tx = fakeTx();
    harness.tx = tx;
    const result = await writeJtcConfig(context, JTC_RAW);
    expect(result.version).toBe(7);
    expect(tx.jtcConfig.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditRows[0]).toMatchObject({
      action: "jtc.config.update",
      targetType: "JtcConfig",
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before opening a transaction and returns a safe ActionResult", async () => {
    const tx = fakeTx();
    harness.tx = tx;
    const error = await writeTicketConfig(context, { enabled: "yes" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SecurityError);
    expect(toActionResult(error)).toEqual({
      ok: false,
      error: "Invalid ticket settings.",
      code: "BAD_REQUEST",
    });
    expect(tx.ticketConfig.upsert).not.toHaveBeenCalled();
  });
});

describe("ticket category writers and reverts", () => {
  it("creates a category and stores the created row as the audit after-image", async () => {
    const tx = fakeTx();
    harness.tx = tx;
    const result = await createTicketCategory(context, CATEGORY_RAW);
    expect(result.id).toBe("cat-1");
    expect(tx.ticketCategory.create).toHaveBeenCalledTimes(1);
    expect(tx.auditRows[0]).toMatchObject({
      action: "tickets.category.create",
      targetId: "cat-1",
      before: null,
      after: expect.objectContaining({ name: "Support" }),
    });
  });

  it("updates and deletes categories within a guild", async () => {
    const tx = fakeTx({ categoryBefore: { id: "cat-1", guildId: GUILD_ID, ...CATEGORY_RAW } });
    harness.tx = tx;
    await updateTicketCategory(context, { ...CATEGORY_RAW, id: "cat-1" });
    expect(tx.ticketCategory.update).toHaveBeenCalledTimes(1);
    expect(tx.auditRows[0]).toMatchObject({ action: "tickets.category.update", targetId: "cat-1" });

    const deleteTx = fakeTx({
      categoryBefore: { id: "cat-1", guildId: GUILD_ID, ...CATEGORY_RAW },
    });
    harness.tx = deleteTx;
    await deleteTicketCategory(context, { id: "cat-1" });
    expect(deleteTx.ticketCategory.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
    expect(deleteTx.auditRows[0]).toMatchObject({
      action: "tickets.category.delete",
      before: expect.objectContaining({ name: "Support" }),
      after: null,
    });
  });

  it("reverts a category creation by deleting the row recorded in after", async () => {
    const row = {
      id: "cat-4",
      guildId: GUILD_ID,
      ...ticketCategoryInputSchema.parse(CATEGORY_RAW),
    };
    const tx = fakeTx({
      categoryBefore: row,
      auditEntry: auditEntry({
        action: "tickets.category.create",
        targetId: "cat-4",
        after: row,
      }),
    });
    harness.tx = tx;
    const result = await revertAuditEntry(context, "audit-1");
    expect(tx.ticketCategory.delete).toHaveBeenCalledWith({ where: { id: "cat-4" } });
    expect(tx.auditLog.update).toHaveBeenCalledWith({
      where: { id: "audit-1" },
      data: { revertedById: context.actorId, revertedAt: expect.any(Date) },
    });
    expect(tx.auditRows[0]).toMatchObject({ action: "tickets.category.create.revert" });
    expect(result.id).toBe("cat-4");
  });

  it("reverts a category deletion with the original id from before", async () => {
    const row = {
      id: "cat-9",
      guildId: GUILD_ID,
      ...ticketCategoryInputSchema.parse(CATEGORY_RAW),
    };
    const tx = fakeTx({
      auditEntry: auditEntry({
        action: "tickets.category.delete",
        targetId: "cat-9",
        before: row,
      }),
    });
    harness.tx = tx;
    const result = await revertAuditEntry(context, "audit-1");
    expect(tx.ticketCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: "cat-9", guildId: GUILD_ID }),
    });
    expect(result.id).toBe("cat-9");
  });

  it("reverts ticket config changes from the stored before image", async () => {
    const before = { guildId: GUILD_ID, ...ticketConfigSchema.parse(TICKET_RAW), enabled: false };
    const tx = fakeTx({
      auditEntry: auditEntry({
        action: "tickets.config.update",
        targetType: "TicketConfig",
        targetId: GUILD_ID,
        before,
      }),
    });
    harness.tx = tx;
    await revertAuditEntry(context, "audit-1");
    expect(tx.ticketConfig.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditRows[0]).toMatchObject({
      action: "tickets.config.update",
      after: expect.objectContaining({ enabled: false }),
    });
  });

  it("refuses audit entries from another guild or already reverted entries", async () => {
    const foreign = fakeTx({
      auditEntry: auditEntry({ guildId: "999999999999999999" }),
    });
    harness.tx = foreign;
    await expect(revertAuditEntry(context, "audit-1")).rejects.toBeInstanceOf(SecurityError);

    const reverted = fakeTx({
      auditEntry: auditEntry({ revertedAt: new Date().toISOString() }),
    });
    harness.tx = reverted;
    await expect(revertAuditEntry(context, "audit-1")).rejects.toBeInstanceOf(SecurityError);
  });
});
