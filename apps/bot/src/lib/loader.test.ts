import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDirectoryModules } from "./loader";

const created: string[] = [];

async function makeDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nujum-loader-"));
  created.push(directory);
  return directory;
}

afterAll(async () => {
  await Promise.all(created.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("loadDirectoryModules", () => {
  it("loads nested modules and skips support files", async () => {
    const directory = await makeDir();
    await writeFile(join(directory, "one.js"), 'exports.command = { name: "one" };');
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "nested", "two.js"), 'exports.command = { name: "two" };');
    await writeFile(join(directory, "types.js"), "exports.nope = true;");
    await writeFile(join(directory, "index.js"), "exports.nope = true;");
    await writeFile(join(directory, "readme.txt"), "ignored");

    const loaded = await loadDirectoryModules<{ name: string }>(directory, "command");
    expect(loaded.map((entry) => entry.name).sort()).toEqual(["one", "two"]);
  });

  it("fails loudly when an export is missing", async () => {
    const directory = await makeDir();
    await writeFile(join(directory, "bad.js"), "exports.somethingElse = true;");
    await expect(loadDirectoryModules(directory, "command")).rejects.toThrow(
      /missing the "command" export/,
    );
  });
});
