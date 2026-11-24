import { describe, expect, it } from "vitest";
import { applyRevert, diffObjects } from "./audit-diff";

describe("diffObjects", () => {
  it("reports nested changes as flat paths", () => {
    const entries = diffObjects(
      { security: { antiRaidEnabled: true, threshold: 10 }, locale: "en" },
      { security: { antiRaidEnabled: false, threshold: 10 }, locale: "en" },
    );
    expect(entries).toEqual([{ path: "security.antiRaidEnabled", before: true, after: false }]);
  });

  it("skips volatile keys", () => {
    const entries = diffObjects(
      { locale: "en", updatedAt: "2025-01-01", updatedBy: "a" },
      { locale: "en", updatedAt: "2026-01-01", updatedBy: "b" },
    );
    expect(entries).toEqual([]);
  });

  it("detects added and removed keys", () => {
    const entries = diffObjects({ a: 1 }, { a: 1, b: 2 });
    expect(entries).toEqual([{ path: "b", before: null, after: 2 }]);
  });

  it("compares arrays and objects by value", () => {
    expect(diffObjects({ roles: ["1", "2"] }, { roles: ["1", "2"] })).toEqual([]);
    expect(diffObjects({ roles: ["1"] }, { roles: ["1", "2"] })).toHaveLength(1);
  });

  it("caps the number of entries", () => {
    const before = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, 0]));
    const after = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, 1]));
    expect(diffObjects(before, after, { maxEntries: 5 })).toHaveLength(5);
  });
});

describe("applyRevert", () => {
  it("reverts a nested path", () => {
    const reverted = applyRevert(
      { security: { antiRaidEnabled: false, threshold: 10 } },
      { path: "security.antiRaidEnabled", before: true, after: false },
    );
    expect(reverted).toEqual({ security: { antiRaidEnabled: true, threshold: 10 } });
  });

  it("does not mutate the input", () => {
    const current = { a: { b: 2 } };
    applyRevert(current, { path: "a.b", before: 1, after: 2 });
    expect(current).toEqual({ a: { b: 2 } });
  });
});
