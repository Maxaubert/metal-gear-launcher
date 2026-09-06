import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetRole, Pack } from "@shared/packs";
import type { Install } from "../steam/resolve";
import { extractUnityAsset } from "./unity";
import { extractM2Asset, decodeManifest } from "./m2";
import { assetsDir as defaultAssetsDir } from "../paths";
import { toolPaths } from "./tools";

export type ToolVersions = { assetStudio: string; freemote: string };
export type AssetManifest = { gameId: string; buildId: string; toolVersions: ToolVersions; files: Partial<Record<AssetRole, string>>; failed: Partial<Record<AssetRole, string>> };
export type Progress = { gameId: string; role: AssetRole; index: number; total: number; status: "start" | "done" | "failed"; error?: string };

const EXT: Record<AssetRole, string> = { mainVisual: "png", logo: "png", numbering: "png", year: "png", bgEffect: "png", bgm: "wav", fontMedium: "ttf", fontBold: "ttf" };

export function isStale(m: AssetManifest | null, install: Install, tools: ToolVersions): boolean {
  return !m || m.buildId !== install.buildId || m.toolVersions.assetStudio !== tools.assetStudio || m.toolVersions.freemote !== tools.freemote;
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
  const manifest: AssetManifest = { gameId: pack.id, buildId: install.buildId, toolVersions: await deps.toolVersions(), files: {}, failed: {} };
  let table: Awaited<ReturnType<typeof decodeManifest>> | undefined;
  const total = pack.assets.length;
  for (const [index, asset] of pack.assets.entries()) {
    const dest = join(dir, `${asset.role}.${EXT[asset.role]}`);
    onProgress({ gameId: pack.id, role: asset.role, index, total, status: "start" });
    try {
      if (asset.source === "unity") await deps.unity(install.installDir, asset, dest);
      else { table ??= await decodeManifest(install.installDir, asset.archive); await deps.m2(install.installDir, asset, dest, undefined, table); }
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
