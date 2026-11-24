import { PrismaClient } from "../generated/client";

/**
 * Serverless-safe Prisma singleton.
 *
 * - On Vercel, module scope is reused between invocations on the same instance;
 *   caching on `globalThis` prevents connection exhaustion during hot reloads.
 * - Both deployables must use the pooled connection string with
 *   `?pgbouncer=true&connection_limit=1`; migrations use DIRECT_URL.
 */

const globalForPrisma = globalThis as unknown as { __nujumPrisma?: PrismaClient };

export type PrismaLogLevel = "query" | "info" | "warn" | "error";

export interface CreatePrismaClientOptions {
  log?: PrismaLogLevel[];
  datasourceUrl?: string;
  errorFormat?: "pretty" | "colorless" | "minimal";
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const defaultLog: PrismaLogLevel[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

  return new PrismaClient({
    log: options.log ?? defaultLog,
    errorFormat: options.errorFormat ?? "minimal",
    ...(options.datasourceUrl ? { datasourceUrl: options.datasourceUrl } : {}),
  });
}

export function getPrisma(): PrismaClient {
  globalForPrisma.__nujumPrisma ??= createPrismaClient();
  return globalForPrisma.__nujumPrisma;
}

/** Test/dev helper. Never call this from request handlers. */
export async function disconnectPrisma(): Promise<void> {
  const client = globalForPrisma.__nujumPrisma;
  if (!client) return;
  await client.$disconnect();
  globalForPrisma.__nujumPrisma = undefined;
}

export { Prisma } from "../generated/client";
export type { PrismaClient } from "../generated/client";
