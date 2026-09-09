import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig } from "../electron/main/config";
import { startGameFor } from "../electron/main/cli";
import { musicFileId } from "../electron/main/music/library";

describe("config", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hub-config-"));
    file = join(dir, "config.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("defaults volume to 0.6 when no config file exists yet", async () => {
    expect(await readConfig(file)).toEqual({ volume: 0.6 });
  });

  it("falls back to defaults on corrupt JSON instead of throwing", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{not json");
    expect(await readConfig(file)).toEqual({ volume: 0.6 });
  });

  it("writes a patch, creating the directory, and merges into what is already there", async () => {
    await writeConfig({ steamPath: "D:\\SteamLibrary" }, file);
    const after = await writeConfig({ volume: 0.3 }, file);
    expect(after).toEqual({ steamPath: "D:\\SteamLibrary", volume: 0.3 });
    expect(await readConfig(file)).toEqual(after);
  });

  it("rejects a volume outside 0..1", async () => {
    await expect(writeConfig({ volume: 1.5 }, file)).rejects.toThrow();
  });

  it("preserves concurrent music, volume and navigation patches, including other games' selections", async () => {
    await Promise.all([
      writeConfig({ menuMusic: { mgs2: "mgs2-original" } }, file),
      writeConfig({ lastGame: "mg12" }, file),
      writeConfig({ menuMusic: { mgs3: "mgs3-original" } }, file),
      writeConfig({ volume: 0.4 }, file),
    ]);
    expect(await readConfig(file)).toEqual({ volume: 0.4, lastGame: "mg12",
      menuMusic: { mgs2: "mgs2-original", mgs3: "mgs3-original" } });
  });

  it("rejects cross-game or arbitrary music IDs without losing the existing config", async () => {
    await writeConfig({ volume: 0.2 }, file);
    await expect(writeConfig({ menuMusic: { mgs2: "mgs3-original" } }, file)).rejects.toThrow();
    await expect(writeConfig({ menuMusic: { mgs2: "https://example.com/music.mp3" } }, file)).rejects.toThrow();
    expect(await readConfig(file)).toEqual({ volume: 0.2 });
  });

  it("preserves local music IDs even when their files are temporarily unavailable", async () => {
    const id = musicFileId("mgs2", "Theme.flac");
    await writeConfig({ lastGame: "mgs1", lastLaunchedGame: "mgs3", menuMusic: { mgs2: id }, volume: 0.4 }, file);
    const config = await readConfig(file);
    expect(config.menuMusic?.mgs2).toBe(id);
    expect(startGameFor([], config)).toBe("mgs3");
    expect(startGameFor(["--game", "mgs4"], config)).toBe("mgs4");
    expect(startGameFor([], { lastGame: "mgs2" })).toBe("mgs2");
    expect(startGameFor([], { lastGame: "invalid" })).toBe("mgs3");
  });
});
