import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetRole } from "@shared/packs";
import { extractGame, isStale, readManifest, readToolVersions } from "../extract/extractor";
import { extractM2Asset } from "../extract/m2";
import { extractUnityAsset } from "../extract/unity";
import { toolPaths } from "../extract/tools";
import sharp from "sharp";
import type { PreparationInventory } from "./discovery";
import type { PreparationSnapshot } from "./snapshot";
import type { PreparationTask } from "./types";

export async function planGames(inventory: PreparationInventory, dataDir: string, previous: PreparationSnapshot | undefined, changed: string[]): Promise<PreparationTask[]> {
  const tools = await readToolVersions();
  const directories = (id: string) => join(dataDir, "assets", id);
  const tasks: PreparationTask[] = [];
  const priorSources = new Map(previous?.sources.map(source => [source.file, source]));
  const currentSources = new Map(inventory.sources.map(source => [source.file, source]));
  const sourceChanged = (file: string): boolean => !!previous && JSON.stringify(priorSources.get(file)) !== JSON.stringify(currentSources.get(file));
  const toolChanged = Object.values(toolPaths()).some(sourceChanged);
  for (const { pack, install } of inventory.games) {
    const loaded = await readManifest(pack.id, directories);
    const manifest = loaded?.files && loaded.toolVersions && loaded.failed ? loaded : null;
    const stale = isStale(manifest, install, tools, pack.assetRevision) || toolChanged;
    const missing: typeof pack.assets = [];
    for (const asset of pack.assets) {
      const file = manifest?.files[asset.role];
      const sources = asset.source === "unity" ? [join(install.installDir, asset.path)] : [join(install.installDir, `${asset.archive}.psb.m`), join(install.installDir, `${asset.archive}.bin`)];
      let exists = false;
      try {
        if (file) {
          const path = join(directories(pack.id), file); const info = await stat(path);
          exists = info.isFile() && info.size > 0;
          // A legacy cache has no completed preparation snapshot to attest its image contents.
          if (exists && !previous && file.toLowerCase().endsWith(".png")) await sharp(path).raw().toBuffer();
        }
      } catch { exists = false; }
      if (stale || !exists || (file && changed.includes(join(directories(pack.id), file))) || sources.some(sourceChanged)) missing.push(asset);
    }
    if (!missing.length) continue;
    tasks.push({ id: `game:${pack.id}`, label: `${pack.title}: artwork and menu assets`, units: missing.length, run: async unitDone => {
      const merged = stale || !manifest ? undefined : manifest;
      const result = await extractGame({ ...pack, assets: missing }, install, progress => { if (progress.status !== "start") unitDone(); }, {
        unity: extractUnityAsset, m2: extractM2Asset, assetsDir: directories, toolVersions: () => tools,
        writeManifest: async (directory, extracted) => {
          if (merged) {
            extracted.files = { ...merged.files, ...extracted.files };
            const failed = { ...merged.failed };
            for (const asset of missing) delete failed[asset.role];
            extracted.failed = { ...failed, ...extracted.failed };
          }
          await mkdir(directory, { recursive: true });
          await writeFile(join(directory, "manifest.json"), JSON.stringify(extracted, null, 2));
        },
      });
      const failed = missing.map(asset => [asset.role, result.failed[asset.role]] as [AssetRole, string | undefined]).filter(([, error]) => !!error);
      if (failed.length) throw new Error(failed.map(([role, error]) => `${role}: ${error}`).join("\n"));
    } });
  }
  return tasks;
}
