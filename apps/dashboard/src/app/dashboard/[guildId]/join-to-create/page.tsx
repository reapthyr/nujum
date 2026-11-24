import { JtcConfigForm } from "../../../../components/jtc-config-form";
import { requireGuildAccess } from "../../../../lib/authz";
import { loadJtcConfig } from "../../../../lib/data";

export const metadata = { title: "Join to create" };

export default async function JoinToCreatePage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const config = await loadJtcConfig(guildId);
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Voice</p>
      <h2 className="mb-6 text-2xl font-semibold">Join-to-create configuration</h2>
      <JtcConfigForm guildId={guildId} defaults={config} />
    </div>
  );
}
