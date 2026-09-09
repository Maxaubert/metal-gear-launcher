import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
const fixture = vi.hoisted(() => ({ tool: "", calls: [] as string[] }));
vi.mock("../electron/main/extract/tools", () => ({
  M2_SEED: "fixture", M2_SEED_LENGTH: 64,
  toolPaths: () => ({ assetStudio: fixture.tool, psbDecompile: fixture.tool }),
  runTool: async (_executable: string, args: string[]) => {
    const source = args[0]!; fixture.calls.push(source);
    const directory = args[args.indexOf("-o") + 1]!;
    if (args[args.indexOf("-t") + 1] === "monoBehaviour") await writeFile(join(directory, "metadata.json"), await readFile(source));
    else await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } }).png().toFile(join(directory, `${basename(source)}.png`));
    return { code: 0, stdout: "", stderr: "" };
  },
}));
import { getBookPage, getBooksCatalog, openBook, saveBookProgress } from "../electron/main/books";
import { filesIn } from "../electron/main/books/cache";
import { resolveBonusFile } from "../electron/main/bonus/media";

let root: string; let steam: string; let data: string; let source: string;
const request = { gameId: "mgs2", kind: "master", language: "en" } as const;
async function file(path: string, value: unknown) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, typeof value === "string" ? value : JSON.stringify(value)); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "books-service-")); steam = join(root, "Steam"); data = join(root, "data");
  fixture.tool = join(root, "decoder.exe"); fixture.calls = [];
  await file(fixture.tool, "fake decoder identity");
  await file(join(steam, "steamapps/appmanifest_2131640.acf"), '"AppState" { "installdir" "game" "buildid" "42" }');
  source = join(steam, "steamapps/common/game/launcher_Data/StreamingAssets/aa/StandaloneWindows64/bonusassetsmgs2_assets_mgs2/bonus");
  await file(join(source, "output_page_en.bundle"), { data: [{ pageNo: 0, backgroundImage: "cover" }, { pageNo: 1, backgroundImage: "cover" }, { pageNo: 2, backgroundImage: "interior" }, { pageNo: 3, backgroundImage: "unopened" }] });
  await file(join(source, "output_index_en.bundle"), { data: [{ pageNo: 1, text: "Cover" }, { pageNo: 2, text: "Chapter" }] });
  for (const name of ["cover", "interior", "unopened"]) await file(join(source, "image", `${name}.bundle`), "image fixture");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("on-demand native book service", () => {
  it("detects without a decoder, opens metadata only, and decodes just the requested spread", async () => {
    expect(await getBooksCatalog(steam, data)).toHaveLength(1); expect(fixture.calls).toEqual([]);
    const document = await openBook(steam, data, request);
    expect(document).toMatchObject({ pageCount: 3, lastPage: 0, contents: [{ title: "Cover", page: 0 }, { title: "Chapter", page: 1 }] });
    expect((await filesIn(data)).filter(path => path.endsWith(".png"))).toEqual([]);
    const page = await getBookPage(steam, data, { ...request, page: 1 });
    expect(page.nativePage).toBe(2); expect(page.imageUrl).toMatch(/^hub-bonus:/);
    expect(fixture.calls.filter(path => path.includes("image"))).toEqual([join(source, "image/interior.bundle")]);
    const calls = fixture.calls.length;
    await getBookPage(steam, data, { ...request, page: 1 }); expect(fixture.calls.length).toBe(calls);
    const saving = saveBookProgress(data, { ...request, page: 1 });
    expect((await openBook(steam, data, request)).lastPage).toBe(1); await saving;
  });
  it("repairs a corrupted image and invalidates caches after a Steam build changes", async () => {
    const page = await getBookPage(steam, data, { ...request, page: 0 });
    const { file: image } = await resolveBonusFile(page.imageUrl!);
    await writeFile(image, "corrupt");
    const before = fixture.calls.length;
    const repaired = await getBookPage(steam, data, { ...request, page: 0 });
    expect(fixture.calls.length).toBe(before + 1);
    expect((await sharp((await resolveBonusFile(repaired.imageUrl!)).file).metadata()).width).toBe(20);
    await file(join(steam, "steamapps/appmanifest_2131640.acf"), '"AppState" { "installdir" "game" "buildid" "43" }');
    await getBookPage(steam, data, { ...request, page: 0 });
    expect(fixture.calls.length).toBe(before + 4);
  });
  it("rejects unavailable games, languages and page numbers before image extraction", async () => {
    await expect(openBook(null, data, request)).rejects.toThrow("Install this game");
    await expect(openBook(steam, data, { ...request, language: "jp" })).rejects.toThrow("language");
    await expect(getBookPage(steam, data, { ...request, page: 100 })).rejects.toThrow("does not exist");
    await expect(getBookPage(steam, data, { ...request, page: -1 })).rejects.toThrow();
    expect(fixture.calls.some(path => path.includes("image"))).toBe(false);
  });
  it("invalidates individual source updates and decoder updates independently of Steam's build ID", async () => {
    await getBookPage(steam, data, { ...request, page: 0 });
    const before = fixture.calls.length;
    const later = new Date(Date.now() + 10000);
    await utimes(join(source, "image/cover.bundle"), later, later);
    await getBookPage(steam, data, { ...request, page: 0 });
    expect(fixture.calls.length).toBe(before + 1);
    await utimes(fixture.tool, later, later);
    await getBookPage(steam, data, { ...request, page: 0 });
    expect(fixture.calls.length).toBe(before + 1);
    await writeFile(fixture.tool, "updated decoder bytes");
    await getBookPage(steam, data, { ...request, page: 0 });
    expect(fixture.calls.length).toBe(before + 4);
  });
  it("allows native Japanese asset names while rejecting path traversal in metadata", async () => {
    await file(join(source, "output_page_en.bundle"), { data: [{ pageNo: 1, backgroundImage: "白マット" }] });
    await file(join(source, "image/白マット.bundle"), "image fixture");
    expect((await getBookPage(steam, data, { ...request, page: 0 })).imageUrl).toMatch(/^hub-bonus:/);
    await file(join(source, "output_page_en.bundle"), { data: [{ pageNo: 1, backgroundImage: "../outside" }] });
    await expect(getBookPage(steam, data, { ...request, page: 0 })).rejects.toThrow("Invalid native book asset name");
  });
});
