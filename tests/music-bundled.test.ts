import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedBundledMenuMusic } from "../electron/main/music/bundled";
import { ensureMenuMusicFolder, getMenuMusicLibrary, musicFileId } from "../electron/main/music/library";
import { effectiveMenuTheme } from "../shared/menuMusic";

describe("optional bundled menu music", () => {
  let root: string;
  let data: string;
  let pack: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hub-music-pack-"));
    data = join(root, "data"); pack = join(root, "pack");
    await mkdir(join(pack, "mgs3"), { recursive: true });
    await writeFile(join(pack, "mgs3", "Snake Eater.mp3"), "bundled-default");
    await writeFile(join(pack, "mgs3", "The Pain.mp3"), "bundled-alternative");
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("allows installations without an optional pack", async () => {
    expect(await seedBundledMenuMusic(data, join(root, "absent"))).toEqual({ added: 0, skipped: 0 });
    await expect(readdir(data)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("seeds a new user once and retains the intended default in MP3 format", async () => {
    expect(await seedBundledMenuMusic(data, pack)).toEqual({ added: 2, skipped: 0 });
    expect(await seedBundledMenuMusic(data, pack)).toEqual({ added: 0, skipped: 2 });
    const library = await getMenuMusicLibrary(data, "mgs3");
    expect(effectiveMenuTheme("mgs3", {}, undefined, library)?.label).toBe("Snake Eater");
    expect(await readdir(join(data, "music", "mgs3"))).toEqual(["Snake Eater.mp3", "The Pain.mp3"]);
  });

  it("fills a partial library without replacing user files, choices, or FLAC counterparts", async () => {
    const folder = await ensureMenuMusicFolder(data, "mgs3");
    await writeFile(join(folder, "Snake Eater.FLAC"), "user-lossless");
    await writeFile(join(folder, "My preferred track.mp3"), "user-song");
    await writeFile(join(folder, "The Pain.png"), "cover");
    expect(await seedBundledMenuMusic(data, pack)).toEqual({ added: 1, skipped: 1 });
    expect(await readFile(join(folder, "Snake Eater.FLAC"), "utf8")).toBe("user-lossless");
    await expect(readFile(join(folder, "Snake Eater.mp3"))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(join(folder, "The Pain.mp3"), "user-edited");
    await seedBundledMenuMusic(data, pack);
    expect(await readFile(join(folder, "The Pain.mp3"), "utf8")).toBe("user-edited");
    const library = await getMenuMusicLibrary(data, "mgs3");
    expect(effectiveMenuTheme("mgs3", {}, musicFileId("mgs3", "My preferred track.mp3"), library)?.label).toBe("My preferred track");
  });

  it("keeps an explicit song selected after FLAC to MP3 conversion", async () => {
    await seedBundledMenuMusic(data, pack);
    const library = await getMenuMusicLibrary(data, "mgs3");
    expect(effectiveMenuTheme("mgs3", {}, musicFileId("mgs3", "The Pain.flac"), library)?.id)
      .toBe(musicFileId("mgs3", "The Pain.mp3"));
  });

  it("prefers the exact selected format when both formats exist", async () => {
    await seedBundledMenuMusic(data, pack);
    await writeFile(join(data, "music", "mgs3", "The Pain.flac"), "lossless");
    const library = await getMenuMusicLibrary(data, "mgs3");
    const selection = musicFileId("mgs3", "The Pain.flac");
    expect(effectiveMenuTheme("mgs3", {}, selection, library)?.id).toBe(selection);
  });

  it("rejects destination junctions and does not write outside the data root", async () => {
    const outside = join(root, "outside");
    await mkdir(outside); await mkdir(data);
    await symlink(outside, join(data, "music"), "junction");
    await expect(seedBundledMenuMusic(data, pack)).rejects.toThrow("inside the hub data folder");
    expect(await readdir(outside)).toEqual([]);
  });
});
