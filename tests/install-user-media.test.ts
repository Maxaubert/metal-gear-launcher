import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_MENU_MUSIC_FILENAMES, effectiveMenuTheme, type MusicGameId } from "../shared/menuMusic";
import { getMenuMusicLibrary } from "../electron/main/music/library";

const temporary: string[] = [];
const shellQuote = (text: string) => `'${text.replaceAll("'", "''")}'`;
async function preserve(source: string, destination: string) {
  return promisify(execFile)("pwsh", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference = 'Stop'; . ${shellQuote(resolve("scripts/preserve-user-media.ps1"))}; Copy-LauncherUserMedia -SourceRoot ${shellQuote(source)} -DestinationRoot ${shellQuote(destination)}`,
  ], { windowsHide: true });
}
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });

it("clean-install media recovery retains each chosen default and custom sounds without restoring configuration or caches", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-preserve-music-")); temporary.push(root);
  const source = join(root, "archived data"), destination = join(root, "fresh data");
  for (const [game, filename] of Object.entries(DEFAULT_MENU_MUSIC_FILENAMES)) {
    await mkdir(join(source, "music", game), { recursive: true });
    await writeFile(join(source, "music", game, filename), Buffer.from([0, 255, 34, 128]));
  }
  await mkdir(join(source, "sounds")); await writeFile(join(source, "sounds", "navigate.wav"), "custom sound");
  await writeFile(join(source, "config.json"), '{"volume":0.2}');
  await mkdir(join(source, "assets")); await writeFile(join(source, "assets", "cached.png"), "cache");
  await preserve(source, destination);
  for (const [id, filename] of Object.entries(DEFAULT_MENU_MUSIC_FILENAMES)) {
    const game = id as MusicGameId;
    expect(await readFile(join(destination, "music", game, filename))).toEqual(Buffer.from([0, 255, 34, 128]));
    const library = await getMenuMusicLibrary(destination, game);
    expect(effectiveMenuTheme(game, { bgm: "original.ogg" }, undefined, library)?.label).toBe(filename.slice(0, -5));
  }
  expect(await readFile(join(destination, "sounds", "navigate.wav"), "utf8")).toBe("custom sound");
  await expect(readFile(join(destination, "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(destination, "assets", "cached.png"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(source, "music", "mgs3", "Snake Eater.flac"))).toEqual(Buffer.from([0, 255, 34, 128]));
});

it("never overwrites an existing music library during recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-preserve-existing-")); temporary.push(root);
  const source = join(root, "backup"), destination = join(root, "fresh");
  for (const folder of [source, destination]) await mkdir(join(folder, "music", "mgs3"), { recursive: true });
  const file = join(destination, "music", "mgs3", "Snake Eater.flac");
  await writeFile(file, "new user file");
  await expect(preserve(source, destination)).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("new user file");
});
