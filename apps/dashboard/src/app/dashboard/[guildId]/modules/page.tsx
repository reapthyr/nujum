import { ModuleToggle } from "../../../../components/module-toggle";
import { requireGuildAccess } from "../../../../lib/authz";
import { loadModules } from "../../../../lib/data";
import { Card, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";

export const metadata = { title: "Modules" };

const categories = [
  { key: "core", label: "Core", copy: "The foundations of a safe, well-run community." },
  {
    key: "community",
    label: "Community",
    copy: "Engagement features you can switch on when needed.",
  },
  { key: "utility", label: "Utility", copy: "Small automations that remove repetitive work." },
] as const;

export default async function ModulesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const modules = await loadModules(guildId);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-primary">Capabilities</p>
        <h2 className="text-2xl font-semibold">Modules</h2>
        <p className="mt-2 text-sm text-muted">
          Toggles are written to PostgreSQL, versioned and hot-reloaded by the bot.
        </p>
      </div>
      {categories.map((category) => (
        <Card key={category.key}>
          <CardHeader>
            <CardTitle>{category.label}</CardTitle>
            <CardDescription>{category.copy}</CardDescription>
          </CardHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {modules
              .filter((module) => module.category === category.key)
              .map((module) => (
                <ModuleToggle
                  key={module.key}
                  guildId={guildId}
                  moduleKey={module.key}
                  label={module.name}
                  description={module.description}
                  enabled={module.enabled}
                  settings={module.settings}
                />
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
