import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BonusVolume } from "@shared/bonus";
import { installFromManifest, listLibraries } from "../steam/library";

export interface BonusInstall { id: BonusVolume; path: string; build: string }
export async function discoverBonus(steamPath: string | null): Promise<BonusInstall[]> {
  if (!steamPath) return [];
  const installs: BonusInstall[] = [];
  for (const library of await listLibraries(steamPath)) {
    for (const [id, appId] of [["vol1", "2306740"], ["vol2", "3036720"]] as const) {
      if (installs.some(install => install.id === id)) continue;
      try {
        const manifest = installFromManifest(await readFile(join(library, "steamapps", `appmanifest_${appId}.acf`), "utf8"));
        const path = join(library, "steamapps/common", manifest.installdir);
        if ((await stat(join(path, "windata/alldata.bin"))).isFile()) installs.push({ id, path, build: manifest.buildid });
      } catch { /* Optional volume is missing or its installation is incomplete. */ }
    }
  }
  return installs;
}
