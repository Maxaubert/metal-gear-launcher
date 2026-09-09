import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cachedExtraction } from "../electron/main/books/cache";
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "book-validation-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("checks unchanged cache identities without repeatedly reading and hashing image bytes", async () => {
  const extract = vi.fn(async (directory: string) => { await writeFile(join(directory, "page.png"), "original image content"); });
  const directory = await cachedExtraction(root, "native-source", extract);
  await cachedExtraction(root, "native-source", extract);
  vi.mocked(readFile).mockClear();
  await Promise.all(Array.from({ length: 6 }, () => cachedExtraction(root, "native-source", extract)));
  expect(readFile).not.toHaveBeenCalled(); expect(extract).toHaveBeenCalledTimes(1);
  await writeFile(join(directory, "page.png"), "damaged");
  await cachedExtraction(root, "native-source", extract); expect(extract).toHaveBeenCalledTimes(2);
});

it("rehashes and repairs same-size corruption despite a restored modification timestamp", async () => {
  const extract = vi.fn(async (directory: string) => {
    const file = join(directory, "page.png"); await writeFile(file, "original");
    const date = new Date("2020-01-01T00:00:00Z"); await utimes(file, date, date);
  });
  const directory = await cachedExtraction(root, "source", extract); await cachedExtraction(root, "source", extract);
  const file = join(directory, "page.png"); const initial = await stat(file);
  await writeFile(file, "corrupt!"); await utimes(file, initial.atime, initial.mtime);
  expect((await stat(file)).mtimeMs).toBe(initial.mtimeMs);
  await cachedExtraction(root, "source", extract);
  expect(extract).toHaveBeenCalledTimes(2); expect(await readFile(file, "utf8")).toBe("original");
});
