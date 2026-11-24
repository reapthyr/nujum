import { requireGuildAccess } from "../../../../lib/authz";
import { loadTicketCategories, loadTicketConfig } from "../../../../lib/data";
import { TicketCategoryManager } from "../../../../components/ticket-category-manager";
import { TicketConfigForm } from "../../../../components/ticket-config-form";
import { TicketPanelPublishForm } from "../../../../components/ticket-panel-publish-form";

export const metadata = { title: "Tickets" };

export default async function TicketsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const [config, categories] = await Promise.all([
    loadTicketConfig(guildId),
    loadTicketCategories(guildId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Support</p>
        <h2 className="text-2xl font-semibold">Ticket configuration</h2>
      </div>
      <TicketConfigForm guildId={guildId} defaults={config} />
      <TicketCategoryManager guildId={guildId} categories={categories} />
      <TicketPanelPublishForm guildId={guildId} defaultChannelId={config.panelChannelId} />
    </div>
  );
}
