import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getNativeSoundtracks } from "../electron/main/music/nativeSoundtracks";
import { getMenuMusicLibrary, musicFileId, validateMenuMusicSelection } from "../electron/main/music/library";
import { effectiveMenuTheme } from "../shared/menuMusic";
import { discoverBonus } from "../electron/main/bonus/discovery";
import { BonusCache } from "../electron/main/bonus/cache";
import { resolveBonusFile } from "../electron/main/bonus/media";

vi.mock("../electron/main/bonus/discovery", () => ({ discoverBonus: vi.fn(async () => []) }));
vi.mock("../electron/main/bonus/cache", () => ({ BonusCache: { open: vi.fn() } }));
vi.mock("../electron/main/music/gameSoundtracks", () => ({ getGameSoundtracks: vi.fn(async () => []) }));

describe("installed menu soundtracks", () => {
  let root: string;
  let stream: string;
  let decode: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), "native-music-"));
    const install = { id: "vol1" as const, path: join(root, "alternate-library", "bonus"), build: "1" };
    stream = join(install.path, "windata", "201", "stream");
    await mkdir(stream, { recursive: true });
    const entries = {
      intro: { file: "04_INTRODUCTION", file_steam: "encoded-intro", text: "04 INTRODUCTION" },
      snake: { file: "11_Snake_Eater", file_steam: "encoded-snake", text: "11 Snake Eater ( Cynthia Harrell )" },
      best: { file: "21_The_Best_Is_Yet_To_Come", text: "21 The Best Is Yet To Come" },
      goodbye: { file: "22_Cant_Say_Goodbye_To_Yesterday", text: "22 Cant Say Goodbye To Yesterday" },
      preferred: { file: "23_Snake_Eater", text: "23 Snake Eater" },
    };
    decode = vi.fn(async () => ({ json: { param: { layout: Object.keys(entries), ...entries } }, directory: root }));
    vi.mocked(discoverBonus).mockResolvedValue([install]);
    vi.mocked(BonusCache.open).mockResolvedValue({ decode } as unknown as BonusCache);
    for (const entry of Object.values(entries)) {
      await writeFile(join(stream, "file_steam" in entry ? entry.file_steam : `${entry.file}.m4a`), "installed-audio");
    }
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("shares discovery during startup and plays source files without copying soundtracks", async () => {
    const libraries = await Promise.all(["mgs1", "mgs2", "mgs3"].map(game => getMenuMusicLibrary(root, game as "mgs1", "steam-root")));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(libraries.map(library => effectiveMenuTheme(library.gameId, {}, undefined, library)?.label))
      .toEqual(["INTRODUCTION", "Cant Say Goodbye To Yesterday", "Snake Eater"]);
    for (const library of libraries) for (const theme of library.themes) {
      const { file } = await resolveBonusFile(theme.url!);
      expect(dirname(file)).toBe(await realpath(stream));
      expect(await readFile(file, "utf8")).toBe("installed-audio");
    }
    await expect(readFile(join(root, "music", "mgs3", "Snake Eater.m4a"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("saves installed selections, migrates legacy preferred track IDs, and rejects removed sources", async () => {
    const library = await getMenuMusicLibrary(root, "mgs3", "steam-root");
    const theme = effectiveMenuTheme("mgs3", {}, musicFileId("mgs3", "Snake Eater.flac"), library)!;
    expect(theme.label).toBe("Snake Eater");
    expect(await validateMenuMusicSelection(root, { gameId: "mgs3", themeId: theme.id }, "steam-root"))
      .toEqual({ gameId: "mgs3", themeId: theme.id });
    await rm(join(stream, "23_Snake_Eater.m4a"));
    await expect(validateMenuMusicSelection(root, { gameId: "mgs3", themeId: theme.id }, "steam-root")).rejects.toThrow("no longer available");
    const refreshed = await getMenuMusicLibrary(root, "mgs3", "steam-root");
    expect(effectiveMenuTheme("mgs3", {}, theme.id, refreshed)?.label).toBe("Snake Eater ( Cynthia Harrell )");
  });

  it("preserves custom imports and explicit selections alongside installed tracks", async () => {
    await mkdir(join(root, "music", "mgs3"), { recursive: true });
    await writeFile(join(root, "music", "mgs3", "My theme.mp3"), "personal");
    const library = await getMenuMusicLibrary(root, "mgs3", "steam-root");
    const custom = effectiveMenuTheme("mgs3", {}, musicFileId("mgs3", "My theme.mp3"), library);
    expect(custom?.label).toBe("My theme");
    expect(custom?.url).toMatch(/^hub-music:/);
    expect(library.themes).toHaveLength(3);
  });

  it("combines matching installed and personal copies while retaining their saved IDs", async () => {
    const original = await getMenuMusicLibrary(root, "mgs1", "steam-root");
    const installedId = original.themes.find(theme => theme.label === "INTRODUCTION")!.id;
    const folder = join(root, "music", "mgs1");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "Introduction.flac"), "personal");
    await writeFile(join(folder, "Introduction.mp3"), "converted");
    const combined = await getMenuMusicLibrary(root, "mgs1", "steam-root");
    expect(combined.themes).toHaveLength(original.themes.length);
    const preferred = musicFileId("mgs1", "Introduction.flac");
    expect(combined.defaultThemeId).toBe(preferred);
    for (const selected of [installedId, preferred, musicFileId("mgs1", "Introduction.mp3")]) {
      expect(effectiveMenuTheme("mgs1", {}, selected, combined)?.id).toBe(preferred);
    }
    expect(await readFile(join(folder, "Introduction.mp3"), "utf8")).toBe("converted");
  });

  it("handles absent libraries, incomplete optional DLC and disappearing drives", async () => {
    expect(await getNativeSoundtracks(root, null)).toEqual([]);
    vi.mocked(discoverBonus).mockResolvedValue([]);
    expect((await getMenuMusicLibrary(root, "mgs3", "steam-root")).themes).toEqual([]);
    vi.mocked(discoverBonus).mockRejectedValue(new Error("Drive unavailable"));
    expect(await getNativeSoundtracks(root, "steam-root")).toEqual([]);
  });

  it("does not grant playback URLs to archive paths or symlinks escaping the installation", async () => {
    const outside = join(root, "personal");
    await mkdir(outside);
    await writeFile(join(outside, "linked.m4a"), "private");
    await rename(stream, `${stream}-original`);
    await symlink(outside, stream, "junction");
    decode.mockResolvedValue({ json: { param: { layout: ["escape", "linked"],
      escape: { file: "../../personal", text: "Escape" }, linked: { file: "linked", text: "Linked" },
    } }, directory: root });
    try { expect(await getNativeSoundtracks(root, "steam-root")).toEqual([]); }
    finally { await rm(stream, { force: true }); }
  });
});
