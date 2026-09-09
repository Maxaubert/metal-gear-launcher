import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedExtraction } from "../electron/main/books/cache";
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), "books-cache-test-")); roots.push(path); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe("lazy book cache", () => {
  it("coalesces concurrent work and reuses a validated extraction", async () => {
    const path = await root(); let calls = 0;
    const extract = async (directory: string) => { calls++; await writeFile(join(directory, "page.txt"), "page one"); };
    const [first, second] = await Promise.all([cachedExtraction(path, "source-build-tool", extract), cachedExtraction(path, "source-build-tool", extract)]);
    expect(first).toBe(second); expect(calls).toBe(1);
    await cachedExtraction(path, "source-build-tool", extract); expect(calls).toBe(1);
    await cachedExtraction(path, "new-build-tool", extract); expect(calls).toBe(2);
  });
  it("recovers missing and same-length corrupted pages rather than serving stale content", async () => {
    const path = await root(); let calls = 0;
    const extract = async (directory: string) => { calls++; await writeFile(join(directory, "page.txt"), "original"); };
    const directory = await cachedExtraction(path, "source", extract);
    await writeFile(join(directory, "page.txt"), "corrupt!");
    await cachedExtraction(path, "source", extract);
    expect(await readFile(join(directory, "page.txt"), "utf8")).toBe("original");
    await rm(join(directory, "page.txt")); await cachedExtraction(path, "source", extract); expect(calls).toBe(3);
  });
  it("does not publish partial failures and retries successfully", async () => {
    const path = await root();
    await expect(cachedExtraction(path, "source", async directory => { await writeFile(join(directory, "partial"), "x"); throw new Error("decoder failed"); })).rejects.toThrow("decoder failed");
    expect(await readdir(path)).toEqual([]);
    await cachedExtraction(path, "source", async directory => { await writeFile(join(directory, "ready"), "x"); });
    expect(await readdir(path)).toHaveLength(1);
  });
});
