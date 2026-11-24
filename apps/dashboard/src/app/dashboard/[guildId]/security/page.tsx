import { SecurityForm } from "../../../../components/security-form";
import { loadSecurityConfig } from "../../../../lib/data";
import { requireGuildAccess } from "../../../../lib/authz";

export const metadata = { title: "Security" };

export default async function SecurityPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const config = await loadSecurityConfig(guildId);
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Protection</p>
      <h2 className="mb-6 text-2xl font-semibold">Security configuration</h2>
      <SecurityForm guildId={guildId} defaults={config} />
    </div>
  );
}
