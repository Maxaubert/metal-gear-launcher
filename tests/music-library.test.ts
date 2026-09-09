import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureMenuMusicFolder, getMenuMusicLibrary, musicFileId, resolveMenuMusicFile, validateMenuMusicSelection } from "../electron/main/music/library";
import { availableMenuThemes, DEFAULT_MENU_MUSIC_FILENAMES, effectiveMenuTheme, resolveMenuMusic } from "../shared/menuMusic";

describe("local menu music library", () => {
  let root: string;
  const originalDefault = DEFAULT_MENU_MUSIC_FILENAMES.mgs2;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hub-music-")); });
  afterEach(async () => { DEFAULT_MENU_MUSIC_FILENAMES.mgs2 = originalDefault; await rm(root, { recursive: true, force: true }); });

  it("leaves first-run and missing libraries silent without creating files", async () => {
    const library = await getMenuMusicLibrary(join(root, "not-created"), "mgs2");
    expect(library.themes).toEqual([]);
    expect(library.defaultThemeId).toBe("");
    expect(resolveMenuMusic("mgs2", { bgm: "original-url" }, undefined, library)).toBeUndefined();
  });

  it("discovers supported files, uses exact filenames as titles and ignores directories or unrelated files", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs2");
    const names = ["2. Snake's Theme.FLAC", "Åpen sjø.mp3", "Track #3.wav", "Music.ogg", "Another.m4a"];
    for (const name of [...names, "Artwork.png", "notes.txt"]) await writeFile(join(folder, name), "fixture");
    await mkdir(join(folder, "Fake.flac"));
    const library = await getMenuMusicLibrary(root, "mgs2");
    expect(library.themes.map(theme => theme.label).sort()).toEqual(names.map(name => name.slice(0, name.lastIndexOf("."))).sort());
    for (const theme of library.themes) {
      expect(theme.url).toMatch(/^hub-music:\/\/mgs2\/mgs2-file-[a-f0-9]{64}\?v=/);
      expect(await readFile(await resolveMenuMusicFile(root, theme.url!), "utf8")).toBe("fixture");
    }
  });

  it("keeps IDs stable across content updates and separate across games", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs2");
    await writeFile(join(folder, "Theme.flac"), "one");
    const before = (await getMenuMusicLibrary(root, "mgs2")).themes[0]!;
    await writeFile(join(folder, "Theme.flac"), "new-longer-content");
    const after = (await getMenuMusicLibrary(root, "mgs2")).themes[0]!;
    expect(after.id).toBe(before.id);
    expect(after.url).not.toBe(before.url);
    expect(musicFileId("mgs3", "Theme.flac")).not.toBe(after.id);
  });

  it("validates saves against the current directory and falls back when a selected file is renamed", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs2");
    await writeFile(join(folder, "Theme.flac"), "fixture");
    const library = await getMenuMusicLibrary(root, "mgs2");
    const theme = library.themes[0]!;
    expect(await validateMenuMusicSelection(root, { gameId: "mgs2", themeId: theme.id })).toEqual({ gameId: "mgs2", themeId: theme.id });
    expect(resolveMenuMusic("mgs2", { bgm: "original" }, theme.id, library)).toBe(theme.url);
    await rename(join(folder, "Theme.flac"), join(folder, "Renamed.flac"));
    await expect(validateMenuMusicSelection(root, { gameId: "mgs2", themeId: theme.id })).rejects.toThrow("no longer available");
    const refreshed = await getMenuMusicLibrary(root, "mgs2");
    expect(resolveMenuMusic("mgs2", { bgm: "original" }, theme.id, refreshed)).toBe(refreshed.themes[0]!.url);
    await expect(resolveMenuMusicFile(root, theme.url!)).rejects.toThrow();
  });

  it("uses a declared first-run filename only when that file exists, preserving explicit selections", async () => {
    DEFAULT_MENU_MUSIC_FILENAMES.mgs2 = "Preferred.flac";
    const folder = await ensureMenuMusicFolder(root, "mgs2");
    expect((await getMenuMusicLibrary(root, "mgs2")).defaultThemeId).toBe("");
    await writeFile(join(folder, "Preferred.flac"), "fixture");
    const library = await getMenuMusicLibrary(root, "mgs2");
    expect(library.defaultThemeId).toBe(musicFileId("mgs2", "Preferred.flac"));
    expect(resolveMenuMusic("mgs2", { bgm: "original" }, undefined, library)).toBe(library.themes[0]!.url);
    expect(resolveMenuMusic("mgs2", { bgm: "original" }, "mgs2-original", library)).toBe(library.themes[0]!.url);
    await expect(validateMenuMusicSelection(root, { gameId: "mgs2", themeId: "mgs2-original" })).rejects.toThrow();
    await writeFile(join(folder, "Alternative.flac"), "fixture");
    const updated = await getMenuMusicLibrary(root, "mgs2");
    const alternative = updated.themes.find(theme => theme.id === musicFileId("mgs2", "Alternative.flac"))!;
    expect(updated.defaultThemeId).toBe(musicFileId("mgs2", "Preferred.flac"));
    expect(resolveMenuMusic("mgs2", {}, "mgs2-original", updated)).toBe(updated.themes.find(theme => theme.id === updated.defaultThemeId)!.url);
    expect(resolveMenuMusic("mgs2", {}, alternative.id, updated)).toBe(alternative.url);
  });

  it("keeps a personal selection after conversion and prefers its exact format when both exist", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs3");
    await writeFile(join(folder, "The Pain.mp3"), "personal-converted");
    const selection = musicFileId("mgs3", "The Pain.flac");
    const converted = await getMenuMusicLibrary(root, "mgs3");
    expect(effectiveMenuTheme("mgs3", {}, selection, converted)?.id).toBe(musicFileId("mgs3", "The Pain.mp3"));
    await writeFile(join(folder, "The Pain.flac"), "personal-lossless");
    const both = await getMenuMusicLibrary(root, "mgs3");
    expect(effectiveMenuTheme("mgs3", {}, selection, both)?.id).toBe(selection);
  });

  it("rejects paths, malformed IDs, other games and unsupported file URLs", async () => {
    for (const url of ["file:///secret.flac", "hub-music://mgs2/../secret.flac", "hub-music://mgs2/%2e%2e%2fsecret.flac",
      `hub-music://mgs2/${musicFileId("mgs3", "Theme.flac")}`, "hub-music://unknown/theme", "hub-music://mgs2/notes.txt"]) {
      await expect(resolveMenuMusicFile(root, url)).rejects.toThrow();
    }
    await expect(ensureMenuMusicFolder(root, "../outside" as "mgs2")).rejects.toThrow();
    await expect(validateMenuMusicSelection(root, { gameId: "mgs2", themeId: musicFileId("mgs2", "Missing.flac") })).rejects.toThrow();
  });

  it("uses the first imported track when the preferred filename is unavailable", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs2");
    await writeFile(join(folder, "Only local track.flac"), "fixture");
    const library = await getMenuMusicLibrary(root, "mgs2");
    expect(availableMenuThemes("mgs2", {}, library)).toEqual([library.themes[0]]);
    expect(effectiveMenuTheme("mgs2", {}, "mgs2-original", library)?.id).toBe(library.themes[0]!.id);
    expect(resolveMenuMusic("mgs2", {}, undefined, library)).toBe(library.themes[0]!.url);
  });

  it("rejects a music directory junction before scanning or creating game folders outside the data root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "hub-music-outside-"));
    try {
      await symlink(outside, join(root, "music"), "junction");
      await expect(getMenuMusicLibrary(root, "mgs2")).rejects.toThrow("inside the hub data folder");
      await expect(ensureMenuMusicFolder(root, "mgs2")).rejects.toThrow("inside the hub data folder");
      await expect(readFile(join(outside, "mgs2"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(join(root, "music"), { force: true }); await rm(outside, { recursive: true, force: true }); }
  });

  it("rejects per-game junctions, including those pointing into another game's library", async () => {
    const other = await ensureMenuMusicFolder(root, "mgs3");
    await writeFile(join(other, "Theme.flac"), "fixture");
    await symlink(other, join(root, "music", "mgs2"), "junction");
    await expect(getMenuMusicLibrary(root, "mgs2")).rejects.toThrow("inside the hub data folder");
  });
});
