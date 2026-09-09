import { createHash } from "node:crypto";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import type { BonusPlaylist } from "../../../shared/bonusPlaylist";
import type { MusicGameId } from "../../../shared/menuMusic";
import { getMenuMusicLibrary, MUSIC_CONTENT_TYPES } from "../music/library";
import { BonusCache } from "./cache";
import { discoverBonus } from "./discovery";
import { allowBonusFile } from "./media";

// Recognizable main themes and vocal finales, played in this order when available.
export const BONUS_CLASSICS: readonly [MusicGameId, string][] = [
  ["mgs1", "Metal Gear Solid Main Theme"],
  ["mgs2", "Metal Gear Solid Main Theme"],
  ["mgs3", "Snake Eater"],
  ["mgs4", "Old Snake (Title)"],
  ["mgs1", "End Title - The Best is Yet to Come"],
  ["mgs2", "Can't Say Goodbye to Yesterday"],
  ["mgs3", "Metal Gear Solid Main Theme (Reprise)"],
  ["mgs4", "Love Theme"],
  ["mgspw", "Heavens Divide"],
  ["mgs3", "Metal Gear Saga - Metal Gear Solid Main Theme"],
  ["mg12", "Theme of Solid Snake (Opening BGM 1)"],
  ["mg12", "Zanzibar Breeze (Opening BGM 2)"],
];

function normalized(title: string) {
  return title.replace(/^(?:\d+[ ._-]+)+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nativeTitle(title: string) {
  return normalized(title).replace(/^oldsnaketitle$/, "oldsnake").replace(/^endtitle(?=thebestisyettocome)/, "")
    .replace(/openingbgm[12]$/, "");
}

function within(root: string, target: string) {
  const part = relative(root, target);
  return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`);
}

async function customPlaylist(dataDir: string): Promise<BonusPlaylist> {
  const root = await realpath(dataDir);
  let folder = root;
  for (const component of ["music", "bonus"]) {
    folder = join(folder, component);
    const info = await lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink() || !within(root, await realpath(folder))) return [];
  }
  const entries = (await readdir(folder, { withFileTypes: true }))
    .filter(entry => entry.isFile() && MUSIC_CONTENT_TYPES[extname(entry.name).toLowerCase()])
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, 256);
  const result: BonusPlaylist = [];
  for (const entry of entries) {
    try {
      const extension = extname(entry.name);
      result.push({ id: `bonus-file-${createHash("sha256").update(entry.name).digest("hex")}`,
        title: entry.name.slice(0, -extension.length),
        url: await allowBonusFile(join(folder, entry.name), folder, MUSIC_CONTENT_TYPES[extension.toLowerCase()]!) });
    } catch { /* A disappearing or unreadable optional file must not block the remaining playlist. */ }
  }
  return result;
}

const safeFile = z.string().regex(/^[\w .'-]+$/).refine(value => value !== "." && value !== "..");
const trackEntry = z.object({ file: safeFile, file_steam: safeFile.optional(), text: z.string() });
const playlistConfig = z.object({ param: z.object({ layout: z.array(z.string()).max(128) }).catchall(z.unknown()) });

/** Decode the small playlist config only; playback never requires bonus artwork extraction. */
async function nativePlaylist(dataDir: string, steamPath: string | null): Promise<BonusPlaylist> {
  const tracks: BonusPlaylist = [];
  for (const install of await discoverBonus(steamPath)) {
    try {
      const cache = await BonusCache.open(install, dataDir);
      const { param } = playlistConfig.parse((await cache.decode("system/config/top_submenu_stream.psb.m")).json);
      const stream = join(install.path, "windata", install.id === "vol1" ? "201" : "777", "stream");
      for (const key of param.layout) {
        const parsed = trackEntry.safeParse(param[key]);
        if (!parsed.success) continue;
        const track = parsed.data;
        const candidates = [...(track.file_steam ? [track.file_steam] : []), `${track.file}.m4a`];
        for (const candidate of candidates) {
          try {
            const file = join(stream, candidate);
            if (!(await stat(file)).isFile()) continue;
            tracks.push({ id: `${install.id}-${key}`, title: track.text.replace(/_/g, " ").replace(/^\d+[ ._-]+/, ""),
              url: await allowBonusFile(file, install.path, "audio/mp4") });
            break;
          } catch { /* Another stream variant or the next track may still be available. */ }
        }
      }
    } catch { /* Bonus volumes are optional and can be independently missing or damaged. */ }
  }
  const seen = new Set<string>();
  const classics = BONUS_CLASSICS.flatMap(([, title]) => tracks.filter(track => {
    if (seen.has(track.url) || nativeTitle(track.title) !== nativeTitle(title)) return false;
    seen.add(track.url);
    return true;
  }));
  return classics.length ? classics : tracks;
}

export async function getBonusPlaylist(dataDir: string, steamPath: string | null): Promise<BonusPlaylist> {
  const custom = await customPlaylist(dataDir).catch(() => []);
  if (custom.length) return custom;
  const games = [...new Set(BONUS_CLASSICS.map(([game]) => game))];
  const libraries = new Map(await Promise.all(games.map(async game =>
    [game, await getMenuMusicLibrary(dataDir, game).catch(() => undefined)] as const)));
  const tracks: BonusPlaylist = [];
  for (const [game, title] of BONUS_CLASSICS) {
    const theme = libraries.get(game)?.themes.find(item => item.url && normalized(item.label) === normalized(title));
    if (theme?.url) tracks.push({ id: theme.id, title: theme.label, url: theme.url });
  }
  return tracks.length ? tracks : nativePlaylist(dataDir, steamPath).catch(() => []);
}
