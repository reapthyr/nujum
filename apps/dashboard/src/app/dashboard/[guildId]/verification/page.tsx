import { VerificationForm } from "../../../../components/verification-form";
import { requireGuildAccess } from "../../../../lib/authz";
import { loadVerificationConfig } from "../../../../lib/data";

export const metadata = { title: "Verification" };

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const config = await loadVerificationConfig(guildId);
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Membership</p>
      <h2 className="mb-6 text-2xl font-semibold">Verification</h2>
      <VerificationForm guildId={guildId} config={config} />
    </div>
  );
}
