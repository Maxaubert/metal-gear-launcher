import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const tools = vi.hoisted(() => ({ executable: "", decode: vi.fn(), decompile: vi.fn(), slice: vi.fn() }));
vi.mock("../electron/main/extract/tools", () => ({ toolPaths: () => ({ psbDecompile: tools.executable }) }));
vi.mock("../electron/main/extract/m2", () => ({ decodeManifest: tools.decode, decompileM2File: tools.decompile, sliceArchiveFile: tools.slice }));
import { BonusCache } from "../electron/main/bonus/cache";
let root: string;
beforeEach(async () => {
  vi.clearAllMocks(); root = await mkdtemp(join(tmpdir(), "hub-bonus-cache-"));
  await mkdir(join(root, "game/windata"), { recursive: true });
  await writeFile(join(root, "game/windata/alldata.bin"), "data");
  await writeFile(join(root, "game/windata/alldata.psb.m"), "manifest");
  tools.executable = join(root, "tool.exe"); await writeFile(tools.executable, "tool");
  tools.decode.mockResolvedValue(new Map([["config.psb.m", { offset: 0, size: 4 }]]));
  tools.slice.mockImplementation(async (_body, _entry, file) => { await writeFile(file, "slice"); });
  tools.decompile.mockImplementation(async file => { await writeFile(`${file}.json`, '{"param":{"ready":true}}'); });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const install = () => ({ id: "vol1" as const, path: join(root, "game"), build: "1" });

it("reuses decoded resources and invalidates for Steam builds, tool updates, and archive changes", async () => {
  const cache = await BonusCache.open(install(), root);
  const first = await cache.decode("config.psb.m");
  expect(first.json).toEqual({ param: { ready: true } });
  await (await BonusCache.open(install(), root)).decode("config.psb.m");
  expect(tools.decompile).toHaveBeenCalledTimes(1);
  expect((await BonusCache.open({ ...install(), build: "2" }, root)).directory).not.toBe(cache.directory);
  await writeFile(tools.executable, "updated tool");
  expect((await BonusCache.open(install(), root)).directory).not.toBe(cache.directory);
  await writeFile(join(root, "game/windata/alldata.bin"), "updated archive");
  expect((await BonusCache.open(install(), root)).directory).not.toBe(cache.directory);
});

it("does not cache a successful exit without decoded output and retries next visit", async () => {
  tools.decompile.mockResolvedValueOnce(undefined);
  const cache = await BonusCache.open(install(), root);
  await expect(cache.decode("config.psb.m")).rejects.toThrow();
  const retry = await (await BonusCache.open(install(), root)).decode("config.psb.m");
  expect(JSON.parse(await readFile(join(retry.directory, "decoded.json"), "utf8"))).toEqual({ param: { ready: true } });
  expect(tools.decompile).toHaveBeenCalledTimes(2);
});

it("re-extracts resources deleted or corrupted while the decoded JSON remains", async () => {
  tools.decompile.mockImplementation(async (file, output) => {
    await writeFile(`${file}.json`, '{"source":{}}');
    await mkdir(join(output, "resources"));
    await writeFile(join(output, "resources/atlas.png"), "fixture image");
  });
  const cache = await BonusCache.open(install(), root);
  const first = await cache.decode("config.psb.m");
  await rm(join(first.directory, "resources/atlas.png"));
  await cache.decode("config.psb.m");
  expect(tools.decompile).toHaveBeenCalledTimes(2);
  await writeFile(join(first.directory, "resources/atlas.png"), "corrupted");
  await cache.decode("config.psb.m");
  expect(tools.decompile).toHaveBeenCalledTimes(3);
});
