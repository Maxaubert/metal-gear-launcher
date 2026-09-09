import { app } from "electron";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { loadPacks } from "@shared/packs";
import { cachedExtraction, fileIdentity } from "../books/cache";
import { allowBonusFile } from "../bonus/media";
import { decoderIdentity } from "../extract/identity";
import { runTool } from "../extract/tools";
import { listLibraries } from "../steam/library";
import { resolveInstall } from "../steam/resolve";
import type { NativeSoundtrack } from "./nativeSoundtracks";
import { OPENING_TXTH, unpackSdtMusic } from "./sdtMusic";

const SOURCES = [
  { gameId: "mg12", file: "us/bgm_2/mg2_bgm36_opening2.sdt", title: "Zanzibar Breeze (Opening BGM 2)", codec: "mtaf" },
  { gameId: "mg12", file: "us/bgm_2/mg2_bgm35_opening1.sdt", title: "Theme of Solid Snake (Opening BGM 1)", codec: "mtaf" },
  { gameId: "mgs2", file: "us/movievr/opening.sdt", title: "Metal Gear Solid Main Theme", codec: "psx" },
] as const;

function decoderPath(): string {
  return join(app?.isPackaged ? process.resourcesPath : join(process.cwd(), "resources"), "tools/vgmstream/vgmstream-cli.exe");
}

type Dependencies = { run: typeof runTool; decoder: () => string; packs: typeof loadPacks };
const defaults: Dependencies = { run: runTool, decoder: decoderPath, packs: loadPacks };

export function createGameSoundtrackReader(deps: Dependencies = defaults) {
  return async (dataDir: string, steamPath: string | null): Promise<NativeSoundtrack[]> => {
    if (!steamPath) return [];
    const tracks: NativeSoundtrack[] = [];
    const libraries = await listLibraries(steamPath);
    for (const source of SOURCES) {
      const pack = deps.packs().find(item => item.id === source.gameId);
      if (!pack) continue;
      const install = await resolveInstall(pack, libraries);
      if (!install) continue;
      try {
        const root = await realpath(install.installDir);
        const file = await realpath(join(root, source.file));
        const rel = relative(root, file);
        if (isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) continue;
        const info = await stat(file);
        if (!info.isFile() || info.size < 32 || info.size > 64 * 1024 * 1024) continue;
        const decoder = deps.decoder();
        const sourceIdentity = await fileIdentity(file);
        const identity = JSON.stringify([1, source.file, install.buildId, sourceIdentity, await decoderIdentity(decoder)]);
        const directory = await cachedExtraction(join(dataDir, "native-music"), identity, async temporary => {
          const raw = join(temporary, "raw");
          await mkdir(raw);
          const input = join(raw, source.codec === "mtaf" ? "music.mtaf" : "music.raw");
          await writeFile(input, unpackSdtMusic(await readFile(file), source.codec));
          if (source.codec === "psx") await writeFile(`${input}.txth`, OPENING_TXTH);
          const output = join(temporary, "music.wav");
          const result = await deps.run(decoder, ["-i", "-o", output, input], { timeoutMs: 120000 });
          if (result.code !== 0) throw new Error("Game soundtrack decoding failed");
          const size = (await stat(output)).size;
          if (size < 44 || size > 128 * 1024 * 1024) throw new Error("Invalid decoded soundtrack size");
          const wav = await readFile(output);
          if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Decoder produced invalid audio");
          if (await fileIdentity(file) !== sourceIdentity) throw new Error("Game soundtrack changed during extraction");
          await rm(raw, { recursive: true, force: true });
        });
        tracks.push({ sourceId: `game:${source.gameId}:${source.file}`, title: source.title, gameId: source.gameId,
          url: await allowBonusFile(join(directory, "music.wav"), directory, "audio/wav") });
      } catch { /* An optional, changed or unsupported soundtrack must not prevent the remaining library from loading. */ }
    }
    return tracks;
  };
}

export const getGameSoundtracks = createGameSoundtrackReader();
