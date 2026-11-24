import { QueueTable } from "../../../../components/queue-table";
import { requireGuildAccess } from "../../../../lib/authz";
import { loadQueue } from "../../../../lib/data";

export const metadata = { title: "Queue" };

export default async function QueuePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const entries = await loadQueue(guildId);
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Reliability</p>
        <h2 className="text-2xl font-semibold">Action queue</h2>
        <p className="mt-2 text-sm text-muted">
          The dashboard remains usable while the bot is offline. Queued actions are revalidated and
          applied automatically once it reconnects.
        </p>
      </div>
      <QueueTable guildId={guildId} entries={entries} />
    </div>
  );
}
