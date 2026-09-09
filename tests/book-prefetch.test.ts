import { expect, it } from "vitest";
import { PageWindow, type PreparedPage } from "../src/books/pageWindow";

const page = (index: number, bytes = 1): PreparedPage => ({ page: { page: index, nativePage: index, title: "", columns: [], artworkUrls: [] }, images: [], bytes });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

it("prioritizes the latest jump over queued speculation with at most two reads", async () => {
  const started: number[] = [], release = new Map<number, (page: PreparedPage) => void>();
  const cache = new PageWindow(index => { started.push(index); return new Promise(resolve => release.set(index, resolve)); });
  cache.focus(0, 50);
  expect(started).toEqual([0, 1]);
  cache.focus(30, 50);
  release.get(0)!(page(0)); await tick();
  expect(started).toEqual([0, 1, 30]);
  release.get(30)!(page(30)); await tick();
  expect(cache.peek(30)?.page).toBe(30);
  expect(cache.peek(0)).toBeUndefined();
  cache.dispose();
  for (const [index, done] of release) done(page(index));
});

it("retains decoded neighbours, coalesces reads, and bounds image memory", async () => {
  let reads = 0;
  const cache = new PageWindow(async index => { reads++; return page(index, 10); }, 30);
  cache.focus(2, 8); await cache.get(2); await tick();
  expect(cache.peek(2)?.page).toBe(2);
  expect(Array.from({ length: 8 }, (_, index) => cache.peek(index)).filter(Boolean).length).toBeLessThanOrEqual(3);
  const before = reads;
  await Promise.all([cache.get(2), cache.get(2)]);
  expect(reads).toBe(before);
  cache.dispose();
});

it("speculative failures do not retry continuously and explicit retry recovers", async () => {
  let failed = true, attempts = 0;
  const cache = new PageWindow(async index => { if (index === 1) { attempts++; if (failed) throw Error("Unavailable"); } return page(index); });
  cache.focus(0, 2); await tick();
  cache.focus(1, 2);
  await expect(cache.get(1)).rejects.toThrow("Unavailable");
  expect(attempts).toBe(1);
  failed = false; cache.retry(1, 2);
  expect((await cache.get(1)).page.page).toBe(1);
  cache.dispose();
});

it("closing a book aborts active preloads before they allocate decoded images", async () => {
  let release!: () => void, decoded = 0;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const cache = new PageWindow(async (index, signal) => { await wait; signal.throwIfAborted(); decoded++; return page(index); });
  cache.focus(0, 10);
  const first = cache.get(0);
  cache.dispose(); release();
  await expect(first).rejects.toThrow();
  await tick(); expect(decoded).toBe(0);
});
