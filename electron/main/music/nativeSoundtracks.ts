import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { MusicGameId } from "../../../shared/menuMusic";
import type { BonusVolume } from "../../../shared/bonus";
import { BonusCache } from "../bonus/cache";
import { discoverBonus } from "../bonus/discovery";
import { allowBonusFile } from "../bonus/media";
import { getGameSoundtracks } from "./gameSoundtracks";

export interface NativeSoundtrack { sourceId: string; title: string; gameId?: MusicGameId; url: string }
export const normalizeTrackTitle = (title: string): string => title.replace(/_/g, " ").replace(/^(?:\d+[ .-]+)+/, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^oldsnaketitle$/, "oldsnake")
  .replace(/^endtitle(?=thebestisyettocome)/, "").replace(/openingbgm[12]$/, "")
  .replace(/^snakeeatercynthiaharrell$/, "snakeeater");

// These numbered soundtrack slots are defined by the installed collection's playlist.
// Unknown future entries remain available to the bonus player without being assigned to a game.
export function soundtrackGame(volume: BonusVolume, file: string): MusicGameId | undefined {
  const number = Number(/^(\d+)_/.exec(file)?.[1]);
  if (volume === "vol1") {
    if (number >= 1 && number <= 3) return "mg12";
    if ((number >= 4 && number <= 7) || number === 21) return "mgs1";
    if ((number >= 8 && number <= 10) || number === 22) return "mgs2";
    if ((number >= 11 && number <= 20) || number === 23) return "mgs3";
  } else {
    if ((number >= 1 && number <= 7) || number === 21) return "mgs4";
    if ((number >= 8 && number <= 16) || number === 22) return "mgspw";
  }
}

const filename = z.string().regex(/^[\w .'-]+$/).refine(value => value !== "." && value !== "..");
const entrySchema = z.object({ file: filename, file_steam: filename.optional(), text: z.string().max(300) });
const configSchema = z.object({ param: z.object({ layout: z.array(z.string()).max(128) }).catchall(z.unknown()) });
const pending = new Map<string, Promise<NativeSoundtrack[]>>();

/** Share startup discovery, reading bonus streams in place and caching decoded game tracks. */
export function getNativeSoundtracks(dataDir: string, steamPath: string | null): Promise<NativeSoundtrack[]> {
  if (!steamPath) return Promise.resolve([]);
  const key = JSON.stringify([dataDir, steamPath]);
  const existing = pending.get(key);
  if (existing) return existing;
  const result = Promise.all([
    getGameSoundtracks(dataDir, steamPath).catch(() => []),
    readSoundtracks(dataDir, steamPath),
  ]).then(parts => parts.flat()).finally(() => pending.delete(key));
  pending.set(key, result);
  return result;
}

async function readSoundtracks(dataDir: string, steamPath: string): Promise<NativeSoundtrack[]> {
  const result: NativeSoundtrack[] = [];
  for (const install of await discoverBonus(steamPath).catch(() => [])) {
    try {
      const cache = await BonusCache.open(install, dataDir);
      const { param } = configSchema.parse((await cache.decode("system/config/top_submenu_stream.psb.m")).json);
      const stream = join(install.path, "windata", install.id === "vol1" ? "201" : "777", "stream");
      for (const key of param.layout) {
        const parsed = entrySchema.safeParse(param[key]);
        if (!parsed.success) continue;
        const track = parsed.data;
        for (const name of [...(track.file_steam ? [track.file_steam] : []), `${track.file}.m4a`]) {
          try {
            const file = join(stream, name);
            if (!(await stat(file)).isFile()) continue;
            const url = await allowBonusFile(file, install.path, "audio/mp4");
            result.push({ sourceId: `${install.id}:${track.file}`, title: track.text.replace(/_/g, " ").replace(/^\d+[ .-]+/, ""),
              gameId: soundtrackGame(install.id, track.file), url });
            break;
          } catch { /* Missing DLC, unreadable files and links outside the install are skipped independently. */ }
        }
      }
    } catch { /* Each bonus volume is optional, including when its index cannot be decoded. */ }
  }
  return result;
}
