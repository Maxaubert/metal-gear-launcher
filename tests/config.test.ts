import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig, writeConfig } from "../electron/main/config";

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
});
