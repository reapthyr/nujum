import { AuditActivityChart } from "../../../../components/audit-activity-chart";
import { AuditTable } from "../../../../components/audit-table";
import { requireGuildAccess } from "../../../../lib/authz";
import { loadAuditLog } from "../../../../lib/data";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const entries = await loadAuditLog(guildId);
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Accountability</p>
        <h2 className="text-2xl font-semibold">Audit log</h2>
        <p className="mt-2 text-sm text-muted">
          Every configuration change is recorded with a before/after diff. Known config changes can
          be reverted in one transaction.
        </p>
      </div>
      <AuditActivityChart entries={entries} />
      <AuditTable guildId={guildId} entries={entries} />
    </div>
  );
}
