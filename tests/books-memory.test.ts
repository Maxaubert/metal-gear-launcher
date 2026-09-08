import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBookMemory } from "../electron/main/books/memory";
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "book-memory-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("reuses parsed metadata and coalesces concurrent reads while rechecking file identity", async () => {
  const file = join(root, "book.json"); await writeFile(file, '{"page":1}');
  const load = vi.fn(async () => JSON.parse(await readFile(file, "utf8")) as { page: number });
  const remember = createBookMemory();
  const values = await Promise.all(Array.from({ length: 8 }, () => remember(file, "book", load)));
  expect(load).toHaveBeenCalledTimes(1); expect(values.every(value => value === values[0])).toBe(true);
  expect(await remember(file, "book", load)).toBe(values[0]); expect(load).toHaveBeenCalledTimes(1);
  await writeFile(file, '{"page":22}'); expect((await remember(file, "book", load)).page).toBe(22); expect(load).toHaveBeenCalledTimes(2);
});

it("detects same-size edits even when modification time is restored", async () => {
  const file = join(root, "book.json"); const date = new Date("2020-01-01T00:00:00Z");
  await writeFile(file, '{"page":1}'); await utimes(file, date, date);
  const initial = await stat(file); const remember = createBookMemory();
  const load = vi.fn(async () => JSON.parse(await readFile(file, "utf8")) as { page: number });
  await remember(file, "book", load);
  await writeFile(file, '{"page":2}'); await utimes(file, date, date);
  expect((await stat(file)).mtimeMs).toBe(initial.mtimeMs);
  expect((await remember(file, "book", load)).page).toBe(2); expect(load).toHaveBeenCalledTimes(2);
});

it("evicts least-recent metadata within the memory budget and does not cache oversized values", async () => {
  const first = join(root, "first.json"); const second = join(root, "second.json");
  await writeFile(first, "x".repeat(100)); await writeFile(second, "y".repeat(100));
  const remember = createBookMemory(1024, 10);
  const loadFirst = vi.fn(() => readFile(first, "utf8")); const loadSecond = vi.fn(() => readFile(second, "utf8"));
  await remember(first, "text", loadFirst); await remember(second, "text", loadSecond); await remember(first, "text", loadFirst);
  expect(loadFirst).toHaveBeenCalledTimes(2);
  const uncached = createBookMemory(100, 10);
  await uncached(first, "text", loadFirst); await uncached(first, "text", loadFirst); expect(loadFirst).toHaveBeenCalledTimes(4);
});

it("does not retain failed reads or serve removed metadata from memory", async () => {
  const file = join(root, "book.json"); await writeFile(file, "metadata");
  const remember = createBookMemory();
  await expect(remember(file, "text", async () => { throw new Error("Read failed"); })).rejects.toThrow("Read failed");
  expect(await remember(file, "text", () => readFile(file, "utf8"))).toBe("metadata");
  await rm(file); await expect(remember(file, "text", async () => "stale")).rejects.toThrow();
});
