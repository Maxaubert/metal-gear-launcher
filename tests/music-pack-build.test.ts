import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Use the YAML reader already installed by electron-builder.
const { load } = createRequire(import.meta.url)("js-yaml") as { load: (source: string) => unknown };

describe("music-free installer packaging", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hub-package-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("keeps the same installer and preserves private tracks left from an older Full build", async () => {
    await mkdir(join(root, "scripts"));
    const script = join(root, "scripts", "package-launcher.mjs");
    await copyFile(resolve("scripts/package-launcher.mjs"), script);
    const inspect = () => JSON.parse(execFileSync(process.execPath, [script, "--dry-run"], { encoding: "utf8" }));
    const expected = { bundledMusic: false, artifactName: "MetalGearLauncher-Setup-x64-${version}.exe" };
    expect(inspect()).toEqual(expected);
    const privateTrack = join(root, "resources", "menu-music", "mgs3", "Snake Eater.mp3");
    await mkdir(join(root, "resources", "menu-music", "mgs3"), { recursive: true });
    await writeFile(privateTrack, "personal-audio-fixture");
    expect(inspect()).toEqual(expected);
    expect(await readFile(privateTrack, "utf8")).toBe("personal-audio-fixture");
  });

  it("limits packaged resources to the launcher icon and extraction tools", async () => {
    const config = load(await readFile(resolve("electron-builder.yml"), "utf8")) as {
      files: string[];
      extraResources: { from: string; to: string }[];
    };
    expect(config.files).toEqual(["out/**", "package.json"]);
    expect(config.extraResources).toEqual([
      { from: "resources/icon.ico", to: "icon.ico" },
      { from: "resources/tools", to: "tools" },
    ]);
  });
});
