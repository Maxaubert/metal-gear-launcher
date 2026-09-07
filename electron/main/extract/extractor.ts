import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetRole, Pack } from "@shared/packs";
import type { Install } from "../steam/resolve";
import { extractUnityAsset } from "./unity";
import { extractM2Asset, decodeManifest } from "./m2";
import { normalizeGhostAlpha } from "./ghostAlpha";
import { fitMainVisualAspect } from "./mainVisualFit";
import { trimToContent } from "./trim";
import { assetsDir as defaultAssetsDir } from "../paths";
import { toolPaths } from "./tools";

export type ToolVersions = { assetStudio: string; freemote: string };
export type AssetManifest = { gameId: string; buildId: string; assetRevision?: number; toolVersions: ToolVersions; files: Partial<Record<AssetRole, string>>; failed: Partial<Record<AssetRole, string>> };
export type Progress = { gameId: string; role: AssetRole; index: number; total: number; status: "start" | "done" | "failed"; error?: string };

const EXT: Record<AssetRole, string> = { mainVisual: "png", mainVisual2: "png", logo: "png", logo2: "png", numbering: "png", year: "png", bgEffect: "png", bgm: "wav", fontMedium: "ttf", fontBold: "ttf", headerYear: "png", headerSubtitle: "png", headerYear2: "png", headerSubtitle2: "png", fontUi: "ttf", headerMark: "png", backgroundArt: "png", reticle1: "png", reticle2: "png", reticle3: "png", settingsHeader: "png", settingsTimeline: "png", settingsOverlay: "png", wallpaper1: "png", wallpaper2: "png", wallpaper3: "png", wallpaper4: "png", wallpaper5: "png", wallpaper6: "png", wallpaperDisplayArea: "png", settingsGrid: "png", settingsGridFine: "png", settingsGridBase: "png", settingsPattern2: "png", settingsPattern3: "png", settingsPattern4: "png", settingsPattern5: "png", settingsPattern6: "png" };
// Reticle textures retain their transparent canvas so rotation preserves the native pivot.
const IMAGE_ROLES = new Set<AssetRole>(["mainVisual", "mainVisual2", "logo", "logo2", "numbering", "year", "bgEffect", "headerYear", "headerSubtitle", "headerYear2", "headerSubtitle2", "headerMark", "backgroundArt"]);

export function isStale(m: AssetManifest | null, install: Install, tools: ToolVersions, assetRevision = 0): boolean {
  return !m || (m.assetRevision ?? 0) !== assetRevision || m.buildId !== install.buildId || m.toolVersions.assetStudio !== tools.assetStudio || m.toolVersions.freemote !== tools.freemote;
}

export async function readManifest(gameId: string, assetsDir = defaultAssetsDir): Promise<AssetManifest | null> {
  try { return JSON.parse(await readFile(join(assetsDir(gameId), "manifest.json"), "utf8")); } catch { return null; }
}

export async function readToolVersions(): Promise<ToolVersions> {
  const { assetStudio, psbDecompile } = toolPaths();
  const v = async (exe: string) => { try { return (await readFile(join(exe, "..", "VERSION"), "utf8")).trim(); } catch { return "unknown"; } };
  return { assetStudio: await v(assetStudio), freemote: await v(psbDecompile) };
}

type Deps = { unity: typeof extractUnityAsset; m2: typeof extractM2Asset; assetsDir: (id: string) => string; toolVersions: () => ToolVersions | Promise<ToolVersions>; writeManifest: (dir: string, m: AssetManifest) => Promise<void> };
const defaults: Deps = {
  unity: extractUnityAsset, m2: extractM2Asset, assetsDir: defaultAssetsDir, toolVersions: readToolVersions,
  writeManifest: async (dir, m) => { await mkdir(dir, { recursive: true }); await writeFile(join(dir, "manifest.json"), JSON.stringify(m, null, 2)); },
};

export async function extractGame(pack: Pack, install: Install, onProgress: (p: Progress) => void, deps: Deps = defaults): Promise<AssetManifest> {
  const dir = deps.assetsDir(pack.id);
  const manifest: AssetManifest = { gameId: pack.id, buildId: install.buildId, assetRevision: pack.assetRevision, toolVersions: await deps.toolVersions(), files: {}, failed: {} };
  let table: Awaited<ReturnType<typeof decodeManifest>> | undefined;
  const total = pack.assets.length;
  for (const [index, asset] of pack.assets.entries()) {
    const dest = join(dir, `${asset.role}.${EXT[asset.role]}`);
    onProgress({ gameId: pack.id, role: asset.role, index, total, status: "start" });
    try {
      if (asset.source === "unity") await deps.unity(install.installDir, asset, dest);
      else { table ??= await decodeManifest(install.installDir, asset.archive); await deps.m2(install.installDir, asset, dest, undefined, table); }
      if (IMAGE_ROLES.has(asset.role)) {
        // Best-effort, same contract as the two touch-ups below: trimming is a quality
        // improvement on an already-successful extraction, never a reason to report failure.
        await trimToContent(dest).catch(() => {});
      }
      if (asset.role === "year" || asset.role === "numbering") {
        // Best-effort legibility touch-up (see ghostAlpha.ts) - the extracted file already
        // stands on its own, so a failure here (e.g. a test double that never wrote `dest`)
        // must not turn a successful extraction into a reported failure.
        await normalizeGhostAlpha(dest, asset.role).catch(() => {});
      }
      if (asset.role === "mainVisual" && asset.edge === "fade") {
        // Same best-effort contract as the ghost touch-up above (see mainVisualFit.ts).
        await fitMainVisualAspect(dest).catch(() => {});
      }
      manifest.files[asset.role] = `${asset.role}.${EXT[asset.role]}`;
      onProgress({ gameId: pack.id, role: asset.role, index, total, status: "done" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      manifest.failed[asset.role] = error;
      onProgress({ gameId: pack.id, role: asset.role, index, total, status: "failed", error });
    }
  }
  await deps.writeManifest(dir, manifest);
  return manifest;
}
