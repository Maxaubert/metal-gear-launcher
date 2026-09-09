import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalog, discoverBooks, metadataSource } from "../electron/main/books/discovery";
const roots: string[] = [];
async function file(path: string, text = "fixture") { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, text); }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe("portable book detection", () => {
  it("finds an optional game in a relocated Steam library without extracting anything", async () => {
    const root = await mkdtemp(join(tmpdir(), "book-discovery-")); roots.push(root);
    const steam = join(root, "Steam"); const library = join(root, "Another drive");
    await file(join(steam, "steamapps/libraryfolders.vdf"), `"libraryfolders" { "1" { "path" "${library.replace(/\\/g, "\\\\")}" } }`);
    await file(join(library, "steamapps/appmanifest_2131640.acf"), '"AppState" { "installdir" "Custom MGS2" "buildid" "42" }');
    const folder = join(library, "steamapps/common/Custom MGS2/launcher_Data/StreamingAssets/aa/StandaloneWindows64/bonusassetsmgs2_assets_mgs2/bonus");
    await file(join(folder, "output_page_en.bundle"));
    expect(await catalog(steam)).toEqual([{ gameId: "mgs2", kind: "master", title: "Master Book", gameTitle: "METAL GEAR SOLID 2: SONS OF LIBERTY", languages: ["en"] }]);
    expect(await readdir(root)).toEqual(expect.arrayContaining(["Steam", "Another drive"]));
    expect((await readdir(root)).length).toBe(2);
  });
  it("detects no books without installations and rejects traversal manifests", async () => {
    expect(await catalog(null)).toEqual([]);
    const root = await mkdtemp(join(tmpdir(), "book-discovery-")); roots.push(root);
    await file(join(root, "steamapps/appmanifest_2131640.acf"), '"AppState" { "installdir" "../outside" "buildid" "42" }');
    expect(await catalog(root)).toEqual([]);
  });
  it("prefers Peace Walker's worldwide page tables but retains original indexes", async () => {
    const root = await mkdtemp(join(tmpdir(), "book-discovery-")); roots.push(root);
    // Build the install directly here so app IDs remain the responsibility of shared packs.
    const standard = join(root, "standard"); const worldwide = join(root, "worldwide");
    await file(join(standard, "output_page_jp.bundle")); await file(join(standard, "output_index_jp.bundle")); await file(join(worldwide, "output_page_jp_ww.bundle"));
    const install = { gameId: "mgspw" as const, title: "PW", path: root, build: "42", roots: { master: [worldwide, standard] } };
    expect(await metadataSource(install, "master", "jp", "page")).toBe(join(worldwide, "output_page_jp_ww.bundle"));
    expect(await metadataSource(install, "master", "jp", "index")).toBe(join(standard, "output_index_jp.bundle"));
    expect(await discoverBooks(null)).toEqual([]);
  });
});
