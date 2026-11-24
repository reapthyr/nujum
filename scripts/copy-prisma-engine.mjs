#!/usr/bin/env node
/**
 * Copy generated Prisma query engines next to the Next.js server bundle.
 *
 * Next.js bundles the generated client JS, but native `.so.node` engines are
 * not copied by webpack. Prisma searches `.next/server` at runtime, so placing
 * the engine there avoids "could not locate the Query Engine" on Vercel.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const dashboardRoot = process.cwd();
const generatedClientDir = path.resolve(dashboardRoot, "../../packages/shared/generated/client");
const nextServerDir = path.resolve(dashboardRoot, ".next/server");

if (!existsSync(generatedClientDir)) {
  console.error(`Prisma client not found at ${generatedClientDir}. Run prisma generate first.`);
  process.exit(1);
}
if (!existsSync(nextServerDir)) {
  console.error(`Next.js server directory not found at ${nextServerDir}. Run next build first.`);
  process.exit(1);
}

const engines = readdirSync(generatedClientDir).filter(
  (file) => file.startsWith("libquery_engine-") && file.endsWith(".so.node"),
);
if (engines.length === 0) {
  console.error(`No Linux Prisma query engine found in ${generatedClientDir}.`);
  process.exit(1);
}

mkdirSync(nextServerDir, { recursive: true });
for (const engine of engines) {
  copyFileSync(path.join(generatedClientDir, engine), path.join(nextServerDir, engine));
}
console.log(`Copied ${engines.length} Prisma query engine(s) into .next/server`);
