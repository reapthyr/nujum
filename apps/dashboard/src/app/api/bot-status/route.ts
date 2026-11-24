import { NextResponse, type NextRequest } from "next/server";
import { createBotClient } from "../../../lib/bot-client";
import { requireGuildAccess } from "../../../lib/authz";
import { SecurityError } from "../../../lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const guildId = request.nextUrl.searchParams.get("guildId") ?? "";
    const ctx = await requireGuildAccess(guildId);
    const status = await createBotClient(ctx.session.user.discordId).getMeta();
    return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof SecurityError ? 403 : 500;
    return NextResponse.json(
      { ok: false, offline: true, error: "Bot status unavailable." },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
