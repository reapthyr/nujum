"use server";

import { revalidatePath } from "next/cache";
import {
  createTicketCategory,
  deleteTicketCategory,
  getAuditContext,
  revertAuditEntry,
  updateTicketCategory,
  writeJtcConfig,
  writeModuleConfig,
  writeSecurityConfig,
  writeTicketConfig,
  writeVerificationConfig,
  type ConfigWriteResult,
} from "../../lib/config-writes";
import { guardGuildAction } from "../../lib/guards";
import { toActionResult, type ActionResult } from "../../lib/http";
import { assertSensitive } from "../../lib/session";

function refresh(guildId: string): void {
  revalidatePath(`/dashboard/${guildId}`);
  revalidatePath(`/dashboard/${guildId}/audit`);
  revalidatePath(`/dashboard/${guildId}/tickets`);
  revalidatePath(`/dashboard/${guildId}/join-to-create`);
}

export async function saveSecurityConfig(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "security.save");
    await assertSensitive(ctx);
    const result = await writeSecurityConfig(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function saveVerificationConfig(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "verification.save");
    await assertSensitive(ctx);
    const result = await writeVerificationConfig(
      await getAuditContext(guildId, ctx.session),
      input,
    );
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function saveModuleConfig(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "module.save");
    await assertSensitive(ctx);
    const result = await writeModuleConfig(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function saveTicketConfig(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "tickets.save");
    await assertSensitive(ctx);
    const result = await writeTicketConfig(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function saveJtcConfig(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "jtc.save");
    await assertSensitive(ctx);
    const result = await writeJtcConfig(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function createTicketCategoryAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "tickets.category.create");
    await assertSensitive(ctx);
    const result = await createTicketCategory(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateTicketCategoryAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "tickets.category.update");
    await assertSensitive(ctx);
    const result = await updateTicketCategory(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteTicketCategoryAction(
  guildId: string,
  input: unknown,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "tickets.category.delete");
    await assertSensitive(ctx);
    const result = await deleteTicketCategory(await getAuditContext(guildId, ctx.session), input);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function revertAuditAction(
  guildId: string,
  auditId: string,
): Promise<ActionResult<ConfigWriteResult>> {
  try {
    const ctx = await guardGuildAction(guildId, "audit.revert");
    await assertSensitive(ctx);
    const result = await revertAuditEntry(await getAuditContext(guildId, ctx.session), auditId);
    refresh(guildId);
    return { ok: true, data: result };
  } catch (error) {
    return toActionResult(error);
  }
}
