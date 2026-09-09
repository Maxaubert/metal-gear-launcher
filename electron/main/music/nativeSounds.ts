import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadPacks } from "@shared/packs";
import { MENU_SOUNDS, type MenuSound, type MenuSoundData } from "@shared/menuSounds";
import { listLibraries } from "../steam/library";
import { resolveInstall } from "../steam/resolve";
import { cachedExtraction, fileIdentity, filesIn } from "../books/cache";
import { decoderIdentity } from "../extract/identity";
import { decodeManifest, decompileM2File, sliceArchiveFile } from "../extract/m2";
import { runTool, toolPaths } from "../extract/tools";
import { nativeWav } from "./nativeWav";

const MGS1: Record<MenuSound, string> = {
  navigate: "se_move.wav.wav", select: "se_decide.wav.wav", back: "se_back.wav.wav",
  options: "se_open.wav.wav", adjust: "se_increment.wav.wav", start: "se_title_start.wav.wav", vr: "se_decide.wav.wav",
};
const UNITY: Record<MenuSound, string> = {
  navigate: "11通常カーソル.wav", select: "12通常決定.wav", back: "13通常キャンセル.wav",
  options: "12通常決定.wav", adjust: "11通常カーソル.wav", start: "sfx_title_select.wav", vr: "12通常決定.wav",
};
type Dependencies = { run: typeof runTool; tools: typeof toolPaths };
const defaults: Dependencies = { run: runTool, tools: toolPaths };

export function createNativeSoundReader(deps: Dependencies = defaults) {
  return async (steamRoot: string | null, dataDir: string): Promise<MenuSoundData> => {
    if (!steamRoot) return {};
    const libraries = await listLibraries(steamRoot);
    const packs = loadPacks().sort((left, right) => Number(right.id === "mgs1") - Number(left.id === "mgs1"));
    const failures: string[] = [];
    for (const pack of packs) {
      const install = await resolveInstall(pack, libraries); if (!install) continue;
      const m2 = pack.id === "mgs1";
      const prefix = pack.assets.find(asset => asset.source === "unity" && asset.path.includes("/StreamingAssets/aa/StandaloneWindows64/"));
      const bundle = prefix?.source === "unity" ? `${prefix.path.split("/StreamingAssets/aa/StandaloneWindows64/")[0]}/StreamingAssets/aa/StandaloneWindows64/defaultlocalgroup_assets_launcher/se/sounddata_se.asset.bundle` : undefined;
      if (!m2 && !bundle) continue;
      const sources = (m2 ? ["windata/alldata.psb.m", "windata/alldata.bin"] : [bundle!]).map(file => join(install.installDir, file));
      try {
        const tool = m2 ? deps.tools().psbDecompile : deps.tools().assetStudio;
        const identity = JSON.stringify([1, pack.id, install.buildId, await Promise.all(sources.map(fileIdentity)), await decoderIdentity(tool)]);
        const directory = await cachedExtraction(join(dataDir, "native-sounds"), identity, async temporary => {
          const raw = join(temporary, "raw"); await mkdir(raw);
          if (m2) {
            const table = await decodeManifest(install.installDir, "windata/alldata", deps);
            const entry = table.get("system/sound/se.psb");
            if (!entry || entry.size <= 0 || entry.size > 16 * 1024 * 1024) throw new Error("Native menu sound archive is unavailable");
            const local = join(raw, "se.psb"); await sliceArchiveFile(sources[1]!, entry, local); await decompileM2File(local, raw, deps);
          } else {
            const result = await deps.run(tool, [sources[0]!, "-o", raw, "-t", "audioClip", "-g", "none", "--audio-format", "wav", "--log-level", "error"]);
            if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Native menu sound extraction failed");
          }
          const files = await filesIn(raw); const names = m2 ? MGS1 : UNITY;
          for (const action of MENU_SOUNDS) {
            const file = files.find(candidate => basename(candidate) === names[action]);
            if (!file || (await stat(file)).size > 4 * 1024 * 1024) throw new Error(`Native menu sound unavailable: ${action}`);
            await writeFile(join(temporary, `${action}.wav`), nativeWav(await readFile(file)));
          }
          await rm(raw, { recursive: true, force: true });
        });
        const sounds: MenuSoundData = {};
        for (const action of MENU_SOUNDS) sounds[action] = (await readFile(join(directory, `${action}.wav`))).toString("base64");
        return sounds;
      } catch (error) { failures.push(`${pack.shortTitle}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (failures.length) throw new Error(`Could not prepare native menu sounds. ${failures.join("; ")}`);
    return {};
  };
}

export const readNativeMenuSounds = createNativeSoundReader();
