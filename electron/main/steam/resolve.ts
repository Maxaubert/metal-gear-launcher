import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pack } from "@shared/packs";
import { installFromManifest } from "./library";

export type Install = { installDir: string; buildId: string };

export async function resolveInstall(pack: Pack, libraries: string[]): Promise<Install | null> {
  for (const lib of libraries) {
    try {
      const acf = await readFile(join(lib, "steamapps", `appmanifest_${pack.steam.appId}.acf`), "utf8");
      const { installdir, buildid } = installFromManifest(acf);
      const dir = join(lib, "steamapps", "common", installdir);
      await readFile(join(dir, pack.launch.exe)); // exe must exist, otherwise treat as not installed
      return { installDir: dir, buildId: buildid };
    } catch {
      /* not in this library */
    }
  }
  return null;
}
