import type { AuditDiffEntry } from "./types/audit";

const DEFAULT_SKIP_KEYS = new Set(["updatedAt", "updatedBy", "createdAt"]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 250;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export interface DiffOptions {
  skipKeys?: ReadonlySet<string>;
  maxEntries?: number;
}

/**
 * Produces a flat, UI-friendly list of changed paths between two JSON values.
 * Used by the dashboard audit log (before/after diff + revert preview).
 */
export function diffObjects(
  before: unknown,
  after: unknown,
  options: DiffOptions = {},
): AuditDiffEntry[] {
  const skipKeys = options.skipKeys ?? DEFAULT_SKIP_KEYS;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const entries: AuditDiffEntry[] = [];

  const push = (path: string, left: unknown, right: unknown): void => {
    if (entries.length >= maxEntries) return;
    entries.push({ path: path || "$", before: left ?? null, after: right ?? null });
  };

  const walk = (left: unknown, right: unknown, path: string, depth: number): void => {
    if (entries.length >= maxEntries) return;

    if (isPlainObject(left) && isPlainObject(right)) {
      if (depth >= MAX_DEPTH) {
        if (stableValue(left) !== stableValue(right)) push(path, left, right);
        return;
      }
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        if (skipKeys.has(key)) continue;
        walk(left[key], right[key], path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }

    if (stableValue(left) !== stableValue(right)) push(path, left, right);
  };

  walk(before, after, "", 0);
  return entries;
}

/** Rebuilds the "after" object with one path reverted to its "before" value. */
export function applyRevert(current: unknown, entry: AuditDiffEntry): unknown {
  if (entry.path === "$") return entry.before;
  const clone: unknown = JSON.parse(JSON.stringify(current ?? {}));
  const segments = entry.path.split(".");
  let cursor: Record<string, unknown> = clone as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const next = cursor[segment];
    if (!isPlainObject(next) && !Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (last) cursor[last] = entry.before;
  return clone;
}
