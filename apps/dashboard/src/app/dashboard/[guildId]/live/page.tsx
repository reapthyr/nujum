import { LiveActionsForm } from "../../../../components/live-actions-form";
import { requireGuildAccess } from "../../../../lib/authz";
import { createBotClient } from "../../../../lib/bot-client";

export const metadata = { title: "Live actions" };

export default async function LivePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const ctx = await requireGuildAccess(guildId);
  const snapshot = await createBotClient(ctx.session.user.discordId).getSnapshot(guildId);

  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Operations</p>
      <h2 className="mb-6 text-2xl font-semibold">Live actions</h2>
      <LiveActionsForm guildId={guildId} snapshot={snapshot.ok ? (snapshot.data ?? null) : null} />
    </div>
  );
}
