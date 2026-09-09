import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
import { createPreparationService, prepareLibrary } from "../electron/main/preparation";
import { readSnapshot } from "../electron/main/preparation/snapshot";
import { cachedExtraction } from "../electron/main/books/cache";
import type { PreparationInventory } from "../electron/main/preparation/discovery";
import type { PreparationProgress } from "@shared/preparation";

let root: string; let cache: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "preparation-test-")); cache = join(root, "book-cache/mgs1"); await mkdir(cache, { recursive: true }); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function inventory(fingerprint = "initial"): PreparationInventory { return { games: [], books: [], bonus: [], sources: [], fingerprint, cacheRoots: [cache] }; }
describe("complete library preparation", () => {
  it("finishes without native tools or optional media when no games are installed", async () => {
    expect(await prepareLibrary(null, root, () => undefined)).toEqual({ ready: true, warm: false, completed: 0, total: 0, failures: [] });
    expect((await prepareLibrary(null, root, () => undefined)).warm).toBe(true);
  });
  it("reports actual fixed work units and publishes completion only after verification", async () => {
    const events: PreparationProgress[] = []; let verified = false;
    const plan = vi.fn(async () => ({ failures: [], tasks: [{ id: "book", label: "Native book", units: 3, run: async (unitDone: () => void) => {
      for (let page = 0; page < 3; page++) { await writeFile(join(cache, `${page}.png`), `page${page}`); unitDone(); }
    } }] }));
    const service = createPreparationService({ inspect: async () => inventory(), plan,
      finalize: async () => { expect(await readSnapshot(root)).toBeUndefined(); verified = true; return []; } });
    const result = await service(null, root, event => { if (event.phase === "ready") expect(verified).toBe(true); events.push(event); });
    expect(result).toEqual({ ready: true, warm: false, completed: 3, total: 3, failures: [] });
    expect(events.filter(event => event.phase === "preparing").map(event => event.completed)).toEqual([0, 1, 2, 3]);
    expect((await readSnapshot(root))?.files).toHaveLength(3);
    expect((await service(null, root, () => undefined)).warm).toBe(true); expect(plan).toHaveBeenCalledTimes(1);
  });
  it("invalidates new installation identities, deleted and corrupted outputs while ignoring reading progress", async () => {
    let fingerprint = "initial"; const image = join(cache, "page.png");
    const plan = vi.fn(async () => ({ failures: [], tasks: [{ id: "page", label: "Page", run: async () => { await writeFile(image, "original"); } }] }));
    const service = createPreparationService({ inspect: async () => inventory(fingerprint), plan, finalize: async () => [] });
    await service(null, root, () => undefined);
    await mkdir(join(root, "book-cache/progress")); await writeFile(join(root, "book-cache/progress/mgs1-master-en.json"), "12");
    expect((await service(null, root, () => undefined)).warm).toBe(true);
    await writeFile(image, "corrupt!"); const future = new Date(Date.now() + 10000); await utimes(image, future, future);
    expect((await service(null, root, () => undefined)).warm).toBe(false); expect(await readFile(image, "utf8")).toBe("original");
    await rm(image); expect((await service(null, root, () => undefined)).warm).toBe(false);
    fingerprint = "another-installed-game"; expect((await service(null, root, () => undefined)).warm).toBe(false);
    expect(plan).toHaveBeenCalledTimes(4);
  });
  it("retains completed cache entries after a failure but never writes the completion marker", async () => {
    let decodes = 0; let fail = true;
    const service = createPreparationService({ inspect: async () => inventory(), finalize: async () => [], plan: async () => ({ failures: [], tasks: [
      { id: "cached-page", label: "Page one", run: async () => { await cachedExtraction(cache, "page", async temporary => { decodes++; await writeFile(join(temporary, "page.png"), "page"); }); } },
      { id: "failed-page", label: "Page two", run: async () => { if (fail) throw new Error("Decoder interrupted"); await writeFile(join(cache, "second.png"), "page2"); } },
    ] }) });
    const result = await service(null, root, () => undefined);
    expect(result.ready).toBe(false); expect(result.failures[0]?.id).toBe("failed-page"); expect(await readSnapshot(root)).toBeUndefined();
    fail = false; expect((await service(null, root, () => undefined)).ready).toBe(true); expect(decodes).toBe(1);
  });
  it("treats bonus extraction warnings and mid-preparation installation changes as incomplete", async () => {
    const service = createPreparationService({ inspect: async () => inventory(), plan: async () => ({ failures: [], tasks: [] }),
      finalize: async () => [{ id: "bonus", label: "Bonus", error: "A soundtrack cover failed to decode" }] });
    expect((await service(null, root, () => undefined)).ready).toBe(false); expect(await readSnapshot(root)).toBeUndefined();
    let calls = 0;
    const changing = createPreparationService({ inspect: async () => inventory(String(++calls)), plan: async () => ({ failures: [], tasks: [] }), finalize: async () => [] });
    expect((await changing(null, root, () => undefined)).failures[0]?.error).toMatch(/changed during/);
    expect(await readSnapshot(root)).toBeUndefined();
  });
  it("coalesces duplicate callers and replays progress without duplicate extraction", async () => {
    let release: () => void = () => undefined; const waiting = new Promise<void>(resolve => { release = resolve; });
    const plan = vi.fn(async () => ({ failures: [], tasks: [{ id: "page", label: "Page", run: async () => { await waiting; await writeFile(join(cache, "page.png"), "page"); } }] }));
    const service = createPreparationService({ inspect: async () => inventory(), plan, finalize: async () => [] });
    const first = service(null, root, () => undefined); const events: PreparationProgress[] = [];
    const second = service(null, root, event => events.push(event));
    expect(first).toBe(second); release(); await first;
    expect(plan).toHaveBeenCalledTimes(1); expect(events.at(-1)?.phase).toBe("ready");
  });
});
