import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { BonusLibrary, BonusTrack, BonusVideo } from "@shared/bonus";
import { discoverBonus, type BonusInstall } from "./discovery";
import { BonusCache } from "./cache";
import { bonusArtwork, bonusSleeve } from "./artwork";
import { allowBonusFile } from "./media";

const safeFile = z.string().regex(/^[\w .'-]+$/).refine(value => value !== "." && value !== "..");
const playlist = z.object({ param: z.record(z.unknown()) });
const trackEntry = z.object({ file: safeFile, file_steam: safeFile.optional(), text: z.string(), maxTime: z.number().positive() });
const videoEntry = z.object({ movie_steam: safeFile, play_time_max: z.number().positive(), chapter: z.string() });
const inFlight = new Map<string, Promise<BonusLibrary>>();

export function getBonusLibrary(steamPath: string | null, dataDir: string): Promise<BonusLibrary> {
  const key = JSON.stringify([steamPath, dataDir]);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = loadBonus(steamPath, dataDir).finally(() => { inFlight.delete(key); });
  inFlight.set(key, pending);
  return pending;
}

async function firstFile(paths: string[]): Promise<string | undefined> {
  for (const file of paths) { try { if ((await stat(file)).isFile()) return file; } catch { /* Optional media. */ } }
}

async function tracks(cache: BonusCache, warnings: string[]): Promise<BonusTrack[]> {
  const { param } = playlist.parse((await cache.decode("system/config/top_submenu_stream.psb.m")).json);
  const order = z.array(z.string()).max(128).parse(param.layout);
  const stream = join(cache.install.path, "windata", cache.install.id === "vol1" ? "201" : "777", "stream");
  const result: BonusTrack[] = [];
  for (const [index, key] of order.entries()) {
    const parsed = trackEntry.safeParse(param[key]);
    if (!parsed.success) continue;
    const track = parsed.data;
    const file = await firstFile([...(track.file_steam ? [join(stream, track.file_steam)] : []), join(stream, `${track.file}.m4a`)]);
    if (!file) continue;
    let artworkUrl: string | undefined;
    try { artworkUrl = await bonusSleeve(cache, index); } catch { if (!warnings.includes("Some soundtrack artwork is unavailable. Refresh to retry.")) warnings.push("Some soundtrack artwork is unavailable. Refresh to retry."); }
    try {
      result.push({ id: `${cache.install.id}-${key}`, title: track.text.replace(/_/g, " "), volume: cache.install.id,
        url: await allowBonusFile(file, cache.install.path, "audio/mp4"), duration: track.maxTime, artworkUrl });
    } catch { warnings.push(`Could not read soundtrack: ${track.text}`); }
  }
  return result;
}

async function videos(cache: BonusCache, artwork: Record<string, string>): Promise<BonusVideo[]> {
  const { param } = playlist.parse((await cache.decode("system/config/top_submenu_movie_title.psb.m")).json);
  const result: BonusVideo[] = [];
  const dlc = join(cache.install.path, "windata/dlc");
  let folders: string[] = [];
  try { folders = (await readdir(dlc, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name)).slice(0, 100).map(entry => join(dlc, entry.name)); } catch { return []; }
  for (const key of ["BD1_en", "BD2_en", "BD1_jp", "BD2_jp"] as const) {
    const parsed = videoEntry.safeParse(param[key]);
    if (!parsed.success) continue;
    const entry = parsed.data;
    const file = await firstFile(folders.map(folder => join(folder, entry.movie_steam)));
    if (!file) continue;
    const language = key.endsWith("en") ? "en" : "jp";
    const second = key.startsWith("BD2");
    const chapters = z.array(z.number().nonnegative()).max(100).parse(param[entry.chapter]).filter(time => time < entry.play_time_max);
    result.push({ id: `vol1-${key}`, title: `Metal Gear Solid${second ? " 2" : ""}: Digital Graphic Novel (${language === "en" ? "English" : "Japanese"})`,
      volume: "vol1", language, chapters, duration: entry.play_time_max,
      artworkUrl: artwork[second ? "video2" : "video1"], url: await allowBonusFile(file, cache.install.path, "video/mp4") });
  }
  return result;
}

async function loadBonus(steamPath: string | null, dataDir: string): Promise<BonusLibrary> {
  const installs = await discoverBonus(steamPath);
  const result: BonusLibrary = { volumes: ["vol1", "vol2"].map(id => ({ id: id as BonusInstall["id"], installed: installs.some(install => install.id === id) })), tracks: [], videos: [], artwork: {}, warnings: [] };
  for (const install of installs) {
    try {
      const cache = await BonusCache.open(install, dataDir);
      let art: Record<string, string> = {};
      try { art = await bonusArtwork(cache); } catch { result.warnings.push(`Bonus Content ${install.id === "vol1" ? "Vol. 1" : "Vol. 2"} artwork is unavailable. Refresh to retry.`); }
      for (const [key, value] of Object.entries(art)) { result.artwork[`${install.id}.${key}`] = value; result.artwork[key] ??= value; }
      try { result.tracks.push(...await tracks(cache, result.warnings)); } catch { result.warnings.push(`Could not read ${install.id} soundtrack list. Refresh to retry.`); }
      if (install.id === "vol1") { try { result.videos.push(...await videos(cache, art)); } catch { result.warnings.push("Could not read video list. Refresh to retry."); } }
    } catch { result.warnings.push(`Bonus Content ${install.id === "vol1" ? "Vol. 1" : "Vol. 2"} could not be read. Verify its Steam installation and refresh.`); }
  }
  return result;
}
