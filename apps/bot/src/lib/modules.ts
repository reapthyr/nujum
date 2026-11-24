import { MODULES, type ModuleKey } from "@nujum/shared";
import { getPrisma } from "@nujum/shared/prisma";
import { serializeError } from "./errors";
import type { BotLogger } from "./logger";

interface ModuleCacheEntry {
  enabled: Map<ModuleKey, boolean>;
  expiresAt: number;
}

const DEFAULT_ENABLED = new Map<ModuleKey, boolean>(
  MODULES.map((module) => [module.key, module.defaultEnabled]),
);

/**
 * Resolves module toggles with the shared registry as the default. Guild rows
 * are cached per process; Phase 4's config listener calls `invalidate`.
 */
export class ModuleService {
  private readonly cache = new Map<string, ModuleCacheEntry>();

  constructor(
    private readonly logger: BotLogger,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async isEnabled(guildId: string, key: ModuleKey): Promise<boolean> {
    return (await this.states(guildId)).get(key) ?? DEFAULT_ENABLED.get(key) ?? false;
  }

  async states(guildId: string): Promise<Map<ModuleKey, boolean>> {
    const cached = this.cache.get(guildId);
    if (cached && cached.expiresAt > this.now()) return cached.enabled;

    const enabled = new Map<ModuleKey, boolean>();
    try {
      const rows = await getPrisma().guildModule.findMany({
        where: { guildId },
        select: { key: true, enabled: true },
      });
      for (const row of rows) enabled.set(row.key, row.enabled);
    } catch (error) {
      this.logger.warn({ err: serializeError(error), guildId }, "module toggles unavailable");
    }

    this.cache.delete(guildId);
    this.cache.set(guildId, { enabled, expiresAt: this.now() + this.ttlMs });
    return enabled;
  }

  async setEnabled(
    guildId: string,
    key: ModuleKey,
    enabled: boolean,
    actorId: string,
  ): Promise<void> {
    await getPrisma().guildModule.upsert({
      where: { guildId_key: { guildId, key } },
      create: { guildId, key, enabled, updatedBy: actorId },
      update: { enabled, updatedBy: actorId },
    });
    this.invalidate(guildId);
  }

  invalidate(guildId?: string): void {
    if (guildId === undefined) this.cache.clear();
    else this.cache.delete(guildId);
  }

  /** Used by tests to seed a known state without a database. */
  seed(guildId: string, states: Readonly<Partial<Record<ModuleKey, boolean>>>): void {
    const enabled = new Map<ModuleKey, boolean>();
    for (const [key, value] of Object.entries(states)) {
      if (value !== undefined) enabled.set(key as ModuleKey, value);
    }
    this.cache.set(guildId, { enabled, expiresAt: this.now() + this.ttlMs });
  }
}
