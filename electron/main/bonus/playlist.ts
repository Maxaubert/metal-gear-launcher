import { createHash } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import type { BonusPlaylist } from "../../../shared/bonusPlaylist";
import type { MusicGameId } from "../../../shared/menuMusic";
import { getMenuMusicLibrary, MUSIC_CONTENT_TYPES } from "../music/library";
import { allowBonusFile } from "./media";
import { getNativeSoundtracks, normalizeTrackTitle } from "../music/nativeSoundtracks";
import { normalizationForInstalled } from "../music/normalization";

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
  ["mgspw", "Metal Gear Solid Peace Walker Main Theme"],
  ["mgs4", "Metal Gear Saga"],
  ["mgs3", "Metal Gear Saga - Metal Gear Solid Main Theme"],
  ["mg12", "Theme of Solid Snake (Opening BGM 1)"],
  ["mg12", "Zanzibar Breeze (Opening BGM 2)"],
];

function normalized(title: string) {
  return title.replace(/^(?:\d+[ ._-]+)+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nativeTitle(title: string) {
  return normalizeTrackTitle(title);
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
      const url = await allowBonusFile(join(folder, entry.name), folder, MUSIC_CONTENT_TYPES[extension.toLowerCase()]!);
      result.push({ id: `bonus-file-${createHash("sha256").update(entry.name).digest("hex")}`,
        title: entry.name.slice(0, -extension.length),
        url, normalizationGain: await normalizationForInstalled(dataDir, url) });
    } catch { /* A disappearing or unreadable optional file must not block the remaining playlist. */ }
  }
  return result;
}

export async function getBonusPlaylist(dataDir: string, steamPath: string | null): Promise<BonusPlaylist> {
  const custom = await customPlaylist(dataDir).catch(() => []);
  if (custom.length) return custom;
  const games = [...new Set(BONUS_CLASSICS.map(([game]) => game))];
  const libraries = new Map(await Promise.all(games.map(async game =>
    [game, await getMenuMusicLibrary(dataDir, game).catch(() => undefined)] as const)));
  const tracks: (BonusPlaylist[number] & { gameId?: MusicGameId })[] = [];
  for (const [game, title] of BONUS_CLASSICS) {
    const theme = libraries.get(game)?.themes.find(item => item.url && normalized(item.label) === normalized(title));
    if (theme?.url) tracks.push({ id: theme.id, title: theme.label, url: theme.url, gameId: game, normalizationGain: theme.normalizationGain });
  }
  const installed = (await getNativeSoundtracks(dataDir, steamPath).catch(() => []))
    .map(track => ({ id: track.sourceId, title: track.title, url: track.url, gameId: track.gameId }));
  const combined = [...tracks, ...installed];
  const seen = new Set<string>();
  const curated = BONUS_CLASSICS.flatMap(([game, title]) => {
    const match = combined.find(track => (!track.gameId || track.gameId === game) && nativeTitle(track.title) === nativeTitle(title));
    if (!match || seen.has(match.url)) return [];
    seen.add(match.url);
    return [match];
  });
  return Promise.all((curated.length ? curated : combined).map(async track => ({
    id: track.id, title: track.title, url: track.url,
    normalizationGain: "normalizationGain" in track && typeof track.normalizationGain === "number"
      ? track.normalizationGain : await normalizationForInstalled(dataDir, track.url),
  })));
}
