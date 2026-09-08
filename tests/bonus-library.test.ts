import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const native = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("../electron/main/bonus/cache", () => ({ BonusCache: { open: async (install: unknown) => ({ install, decode: native.decode }) } }));
vi.mock("../electron/main/bonus/artwork", () => ({ bonusArtwork: async () => ({ video1: "fixture-art" }), bonusSleeve: async () => "fixture-sleeve" }));
import { getBonusLibrary } from "../electron/main/bonus/library";
import { resolveBonusFile } from "../electron/main/bonus/media";
let root: string;
beforeEach(async () => { vi.clearAllMocks(); root = await mkdtemp(join(tmpdir(), "hub-bonus-library-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("coalesces scans, maps native labels and chapters, and excludes uninstalled tracks and DLC", async () => {
  const install = join(root, "steamapps/common/Bonus");
  await mkdir(join(install, "windata/201/stream"), { recursive: true });
  await mkdir(join(install, "windata/dlc/2501700"), { recursive: true });
  await writeFile(join(root, "steamapps/appmanifest_2306740.acf"), '"AppState" { "installdir" "Bonus" "buildid" "1" }');
  await writeFile(join(install, "windata/alldata.bin"), "archive");
  await writeFile(join(install, "windata/201/stream/opaque-audio"), "audio");
  await writeFile(join(install, "windata/dlc/2501700/opaque-video"), "video");
  native.decode.mockImplementation(async (file: string) => ({ json: { param: file.includes("movie") ? {
    BD1_en: { movie_steam: "opaque-video", play_time_max: 400, chapter: "chapter_0" },
    BD1_jp: { movie_steam: "missing-video", play_time_max: 400, chapter: "chapter_0" }, chapter_0: [0, 123.45, 350],
  } : {
    layout: ["Theme", "Absent", "Unsafe"],
    Theme: { file: "01_Theme", file_steam: "opaque-audio", text: "01 Theme", maxTime: 233 },
    Absent: { file: "02_Absent", file_steam: "not-installed", text: "02 Absent", maxTime: 50 },
    Unsafe: { file: "../secret", text: "unsafe", maxTime: 50 },
  } } }));
  const first = getBonusLibrary(root, root);
  expect(getBonusLibrary(root, root)).toBe(first);
  const library = await first;
  expect(library.volumes).toEqual([{ id: "vol1", installed: true }, { id: "vol2", installed: false }]);
  expect(library.tracks).toHaveLength(1);
  expect(library.tracks[0]).toMatchObject({ title: "01 Theme", duration: 233 });
  expect(library.videos).toHaveLength(1);
  expect(library.videos[0]).toMatchObject({ language: "en", chapters: [0, 123.45, 350], artworkUrl: "fixture-art" });
  expect((await resolveBonusFile(library.videos[0]!.url)).file).toBe(join(install, "windata/dlc/2501700/opaque-video"));
  expect(library.warnings).toEqual([]);
});

it("returns an honest empty library with neither volume installed", async () => {
  expect(await getBonusLibrary(null, root)).toEqual({ volumes: [{ id: "vol1", installed: false }, { id: "vol2", installed: false }], tracks: [], videos: [], artwork: {}, warnings: [] });
  expect(native.decode).not.toHaveBeenCalled();
});
