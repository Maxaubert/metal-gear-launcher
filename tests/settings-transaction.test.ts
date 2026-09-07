import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitSettings, settingsRevision } from "../electron/main/settings/transaction";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hub-settings-transaction-"));
  directories.push(directory);
  return { directory, config: join(directory, "config.ini"), backups: join(directory, "backups") };
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("settings transaction", () => {
  it("rejects a stale original without overwriting external changes", async () => {
    const { config, backups } = await fixture();
    await writeFile(config, "external edit");
    await expect(commitSettings([{ path: config, original: Buffer.from("old"), updated: Buffer.from("new") }], backups))
      .rejects.toThrow("changed outside");
    expect(await readFile(config, "utf8")).toBe("external edit");
  });
  it("preserves an exact backup and verifies the committed bytes", async () => {
    const { config, backups } = await fixture();
    const original = Buffer.from("; custom\r\n[Display]\r\nWidth=1920\r\n");
    const updated = Buffer.from("; custom\r\n[Display]\r\nWidth=3840\r\n");
    await writeFile(config, original);
    await commitSettings([{ path: config, original, updated }], backups);
    expect(await readFile(config)).toEqual(updated);
    const transaction = join(backups, (await readdir(backups))[0]!);
    expect(await readFile(join(transaction, "0-config.ini"))).toEqual(original);
    expect(JSON.parse(await readFile(join(transaction, "manifest.json"), "utf8"))[0].path).toBe(config);
  });
  it("does not replace any target when staging a later target fails", async () => {
    const { directory, config, backups } = await fixture();
    const original = Buffer.from("original");
    await writeFile(config, original);
    await expect(commitSettings([
      { path: config, original, updated: Buffer.from("edited") },
      { path: join(directory, "missing-parent", "config.ini"), original: null, updated: Buffer.from("new") },
    ], backups)).rejects.toThrow();
    expect(await readFile(config)).toEqual(original);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
  it("distinguishes absent files from empty files and includes file identity", () => {
    expect(settingsRevision([{ path: "a", original: null }])).not.toBe(settingsRevision([{ path: "a", original: Buffer.alloc(0) }]));
    expect(settingsRevision([{ path: "a", original: Buffer.from("same") }])).not.toBe(settingsRevision([{ path: "b", original: Buffer.from("same") }]));
  });
  it("rolls back an earlier replacement if committing a later file fails", async () => {
    const { directory, config, backups } = await fixture();
    const second = join(directory, "second.ini");
    await writeFile(config, "first original");
    await writeFile(second, "second original");
    const rename = (await vi.importActual<typeof fs>("node:fs/promises")).rename;
    let calls = 0;
    const spy = vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (++calls === 2) throw new Error("Simulated replacement failure");
      return rename(from, to);
    });
    try {
      await expect(commitSettings([
        { path: config, original: Buffer.from("first original"), updated: Buffer.from("first updated") },
        { path: second, original: Buffer.from("second original"), updated: Buffer.from("second updated") },
      ], backups)).rejects.toThrow("No pending changes were applied");
      expect(await readFile(config, "utf8")).toBe("first original");
      expect(await readFile(second, "utf8")).toBe("second original");
    } finally { spy.mockRestore(); }
  });
  it("does not roll back over a concurrent external edit and points to the backups", async () => {
    const { directory, config, backups } = await fixture();
    const second = join(directory, "second.ini");
    await writeFile(config, "first original");
    await writeFile(second, "second original");
    const rename = (await vi.importActual<typeof fs>("node:fs/promises")).rename;
    let calls = 0;
    const spy = vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (++calls === 2) {
        await writeFile(config, "external edit while saving");
        throw new Error("Simulated replacement failure");
      }
      return rename(from, to);
    });
    try {
      await expect(commitSettings([
        { path: config, original: Buffer.from("first original"), updated: Buffer.from("first updated") },
        { path: second, original: Buffer.from("second original"), updated: Buffer.from("second updated") },
      ], backups)).rejects.toThrow("Restore required for config.ini. Backups:");
      expect(await readFile(config, "utf8")).toBe("external edit while saving");
      expect(await readFile(second, "utf8")).toBe("second original");
    } finally { spy.mockRestore(); }
  });
});
