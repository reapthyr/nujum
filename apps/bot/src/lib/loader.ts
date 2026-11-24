import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".ts"]);

function isLoadable(file: string): boolean {
  const extension = extname(file);
  if (!SOURCE_EXTENSIONS.has(extension)) return false;
  if (file.endsWith(".d.ts") || file.endsWith(".test.ts") || file.endsWith(".test.js"))
    return false;
  const base = file.replace(/\\/g, "/").split("/").pop() ?? "";
  // Support files never export a command/event.
  return base !== "types.ts" && base !== "types.js" && base !== "index.ts" && base !== "index.js";
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile() && isLoadable(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Imports every module in a directory and returns the requested named export.
 * Works with both `tsx` (source) and compiled CommonJS output.
 */
export async function loadDirectoryModules<T>(directory: string, exportName: string): Promise<T[]> {
  const files = (await walk(directory)).sort();
  const modules: T[] = [];

  for (const file of files) {
    const imported: unknown = await import(pathToFileURL(file).href);
    if (typeof imported !== "object" || imported === null) {
      throw new Error(`Module ${file} did not export an object`);
    }
    const namespace = imported as Record<string, unknown>;
    const value = namespace[exportName];
    if (value === undefined) {
      throw new Error(`Module ${file} is missing the "${exportName}" export`);
    }
    modules.push(value as T);
  }

  return modules;
}
