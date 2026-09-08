#!/usr/bin/env node
// Generates the e2e asset fixtures: a 64x64 solid-colour PNG for each visual asset role, a
// 1-second silent WAV, and a manifest.json per game id, all under e2e/fixtures/assets/<gameId>/.
// No Konami assets are ever committed - these are hand-made placeholders, and the manifest's
// buildId/toolVersions must match e2e/fixtures/steam's appmanifest_*.acf files and this repo's
// resources/tools/*/VERSION files so extractor.isStale() reports the fixtures as fresh.
//
// Run manually (`node e2e/fixtures/make-fixtures.mjs`) whenever the fixtures need regenerating;
// `npm run e2e` does not run this script, it only consumes its committed output.
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, "assets");

const ROLE_COLOURS = {
  mainVisual: { r: 200, g: 80, b: 40 },
  logo: { r: 40, g: 120, b: 200 },
  numbering: { r: 220, g: 200, b: 40 },
  year: { r: 80, g: 180, b: 100 },
  bgEffect: { r: 120, g: 60, b: 160 },
};

// gameId -> buildId, must match the appmanifest_<appId>.acf buildid in e2e/fixtures/steam.
const BUILD_IDS = {
  mg12: "100001",
  mgs1: "100002",
  mgs2: "100003",
  mgs3: "100004",
  mgs4: "100005",
  mgspw: "100006",
};

// Must match resources/tools/AssetStudioModCLI/VERSION and resources/tools/FreeMote/VERSION.
const TOOL_VERSIONS = { assetStudio: "v0.19.0", freemote: "v4.7.0" };

function silentWav(seconds = 1, sampleRate = 8000) {
  const numSamples = seconds * sampleRate;
  const dataSize = numSamples * 2; // 16-bit mono PCM
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  // Sample bytes are left at Buffer.alloc's zero-fill, i.e. silence.
  return buffer;
}

async function main() {
  for (const [gameId, buildId] of Object.entries(BUILD_IDS)) {
    const dir = join(assetsDir, gameId);
    await mkdir(dir, { recursive: true });

    const files = {};
    for (const [role, background] of Object.entries(ROLE_COLOURS)) {
      if (gameId === "mgspw" && role === "numbering") continue;
      const fileName = `${role}.png`;
      await sharp({ create: { width: 64, height: 64, channels: 3, background } })
        .png()
        .toFile(join(dir, fileName));
      files[role] = fileName;
    }

    // Hand-made shapes exercise the original menu sprite layout without game assets.
    if (["mg12", "mgs2", "mgs3", "mgs4", "mgspw"].includes(gameId)) {
      const shapes = { headerYear: [gameId === "mgs2" ? 313 : 141, 88], headerSubtitle: [237, 47] };
      if (gameId === "mg12") Object.assign(shapes, { mainVisual2: [256, 178], logo2: [256, 95], headerYear2: [141, 88], headerSubtitle2: [239, 17] });
      if (gameId === "mg12") Object.assign(shapes, { wallpaper1: [160, 90], wallpaper2: [160, 90], wallpaper3: [160, 90], wallpaper4: [160, 90], wallpaper5: [160, 90], wallpaper6: [160, 90], wallpaperDisplayArea: [120, 90], settingsOverlay: [160, 90], settingsGrid: [64, 64], settingsGridFine: [64, 64], settingsGridBase: [160, 90] });
      if (gameId === "mgs2") Object.assign(shapes, { settingsOverlay: [160, 129], settingsPattern2: [160, 129], settingsPattern3: [160, 129], settingsPattern4: [160, 129], settingsPattern5: [160, 129], settingsPattern6: [160, 129] });
      if (gameId === "mgspw") Object.assign(shapes, { reticle1: [256, 251], reticle2: [256, 251], reticle3: [256, 251] });
      for (const [role, [width, height]] of Object.entries(shapes)) {
        const fileName = `${role}.png`;
        await sharp({ create: { width, height, channels: 4, background: { r: 40, g: 80, b: 120, alpha: 1 } } }).png().toFile(join(dir, fileName));
        files[role] = fileName;
      }
    }

    await writeFile(join(dir, "bgm.wav"), silentWav());
    files.bgm = "bgm.wav";

    if (gameId === "mgs1") {
      for (const role of ["nativeTextAtlas", "nativeFontAtlas"]) {
        await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
          .png().toFile(join(dir, `${role}.png`));
        files[role] = `${role}.png`;
      }
      const glyphs = Object.fromEntries(Array.from({ length: 95 }, (_, index) => [String.fromCharCode(index + 32),
        { x: 0, y: 0, width: 8, height: 12, advance: 10, bearingX: 0, bearingY: 12 }]));
      await writeFile(join(dir, "nativeTextMetrics.json"), JSON.stringify({ kind: "sprites", width: 64, height: 32, sprites: {} }));
      await writeFile(join(dir, "nativeFontMetrics.json"), JSON.stringify({ kind: "font", width: 64, height: 32, size: 22, glyphs }));
      files.nativeTextMetrics = "nativeTextMetrics.json";
      files.nativeFontMetrics = "nativeFontMetrics.json";
    }

    const assetRevision = gameId === "mgs1" ? 2 : ["mg12", "mgs2"].includes(gameId) ? 3 : ["mgs3", "mgs4", "mgspw"].includes(gameId) ? 1 : 0;
    const manifest = { gameId, buildId, ...(assetRevision ? { assetRevision } : {}), toolVersions: TOOL_VERSIONS, files, failed: {} };
    await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
  console.log(`Wrote fixtures for ${Object.keys(BUILD_IDS).length} games to ${assetsDir}`);
}

await main();
