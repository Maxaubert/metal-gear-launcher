import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_MENU_MUSIC_FILENAMES, MUSIC_PROTOCOL, menuMusicRequest, type MenuMusicLibrary, type MenuTheme, type MusicGameId } from "../../../shared/menuMusic";
import { settingsGameId } from "../../../shared/settings";
import { getNativeSoundtracks, normalizeTrackTitle } from "./nativeSoundtracks";
import { normalizationForFile, normalizationForInstalled } from "./normalization";

export const MUSIC_CONTENT_TYPES: Record<string, string> = {
  ".flac": "audio/flac", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
};
export const musicFileId = (gameId: MusicGameId, filename: string): string =>
  `${gameId}-file-${createHash("sha256").update(filename).digest("hex")}`;

const titleKey = (title: string) => title.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const formatOrder = [".flac", ".wav", ".m4a", ".ogg", ".mp3"];

/** One menu row per title, retaining every source ID for existing saved selections. */
function uniqueThemes(themes: MenuTheme[]): MenuTheme[] {
  const result = new Map<string, MenuTheme>();
  for (const theme of themes) {
    const key = titleKey(theme.label);
    const existing = result.get(key);
    if (!existing) result.set(key, { ...theme, formatAliases: [...(theme.formatAliases ?? [])] });
    else existing.formatAliases = [...new Set([...(existing.formatAliases ?? []), theme.id, ...(theme.formatAliases ?? [])])];
  }
  return [...result.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function within(root: string, target: string): boolean {
  const part = relative(root, target);
  return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`);
}

/** Reject junctions and directory links before any music files are read or folders opened. */
async function checkedFolder(root: string, gameId: MusicGameId, create: boolean): Promise<string> {
  settingsGameId.parse(gameId);
  if (create) await mkdir(root, { recursive: true });
  const canonicalRoot = await realpath(root);
  let parent = canonicalRoot;
  for (const component of ["music", gameId]) {
    const next = join(parent, component);
    if (create) await mkdir(next, { recursive: true });
    const info = await lstat(next);
    const canonical = await realpath(next);
    if (!info.isDirectory() || info.isSymbolicLink() || !within(canonicalRoot, canonical)) throw new Error("Music folder must stay inside the hub data folder.");
    parent = canonical;
  }
  return parent;
}

export function ensureMenuMusicFolder(root: string, gameId: MusicGameId): Promise<string> {
  return checkedFolder(root, gameId, true);
}

type LocalTrack = { id: string; label: string; file: string; revision: string };
async function localTracks(root: string, gameId: MusicGameId): Promise<LocalTrack[]> {
  let folder: string;
  try { folder = await checkedFolder(root, gameId, false); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const tracks: LocalTrack[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const extension = extname(entry.name);
    if (!entry.isFile() || !MUSIC_CONTENT_TYPES[extension.toLowerCase()]) continue;
    const file = join(folder, entry.name);
    try {
      const canonical = await realpath(file);
      if (!within(folder, canonical)) continue;
      const info = await stat(canonical);
      if (!info.isFile()) continue;
      tracks.push({ id: musicFileId(gameId, entry.name), label: entry.name.slice(0, -extension.length), file: canonical,
        revision: `${info.size}-${info.mtimeMs}` });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return tracks.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) || a.id.localeCompare(b.id));
}

export async function getMenuMusicLibrary(root: string, gameId: MusicGameId, steamPath: string | null = null): Promise<MenuMusicLibrary> {
  settingsGameId.parse(gameId);
  const tracks = await localTracks(root, gameId);
  const desiredFile = DEFAULT_MENU_MUSIC_FILENAMES[gameId];
  const desiredId = desiredFile ? musicFileId(gameId, desiredFile) : undefined;
  const desiredLabel = desiredFile?.slice(0, -extname(desiredFile).length).toLowerCase();
  const native = (await getNativeSoundtracks(root, steamPath)).filter(track => track.gameId === gameId);
  const installed = native.map(track => ({ id: musicFileId(gameId, `installed:${track.sourceId}`), label: track.title, url: track.url,
    formatAliases: Object.keys(MUSIC_CONTENT_TYPES).flatMap(extension => [musicFileId(gameId, `${track.title}${extension}`),
      ...(desiredFile && normalizeTrackTitle(track.title) === normalizeTrackTitle(desiredFile.slice(0, -extname(desiredFile).length))
        && (track.title.toLowerCase() === desiredLabel || !native.some(other => other.title.toLowerCase() === desiredLabel))
        ? [musicFileId(gameId, `${desiredFile.slice(0, -extname(desiredFile).length)}${extension}`)] : [])]) }));
  const preferred = installed.find(track => desiredLabel && track.label.toLowerCase() === desiredLabel)
    ?? installed.find(track => desiredLabel && normalizeTrackTitle(track.label) === normalizeTrackTitle(desiredLabel));
  const fallbackTitles: Partial<Record<MusicGameId, string>> = {
    mg12: "Theme of Solid Snake", mgs1: "The Best Is Yet To Come", mgs2: "Cant Say Goodbye To Yesterday",
    mgs3: "Snake Eater ( Cynthia Harrell )", mgs4: "Old Snake", mgspw: "Metal Gear Solid Peace Walker Main Theme",
  };
  const fallback = installed.find(track => normalizeTrackTitle(track.label) === normalizeTrackTitle(fallbackTitles[gameId] ?? ""));
  // User files take precedence over matching installed titles. Prefer lossless formats
  // when older imports left both the original and a compressed playback copy.
  const personal = [...tracks].sort((a, b) => formatOrder.indexOf(extname(a.file).toLowerCase()) - formatOrder.indexOf(extname(b.file).toLowerCase()))
    .map(track => ({ id: track.id, label: track.label,
      formatAliases: Object.keys(MUSIC_CONTENT_TYPES).map(extension => musicFileId(gameId, `${track.label}${extension}`)),
      url: `${MUSIC_PROTOCOL}://${gameId}/${track.id}?v=${track.revision}` }));
  const themes = uniqueThemes([...personal, ...installed]);
  // Analyze only the visible source of a deduplicated title. Preparation waits
  // for these cached measurements, so browsing never has to decode a song first.
  await Promise.all(themes.map(async theme => {
    const local = tracks.find(track => track.id === theme.id);
    theme.normalizationGain = local ? await normalizationForFile(root, local.file)
      : await normalizationForInstalled(root, theme.url!);
  }));
  const defaultId = preferred?.id ?? tracks.find(track => track.id === desiredId)?.id
    ?? tracks.find(track => track.label.toLowerCase() === desiredLabel)?.id ?? fallback?.id ?? installed[0]?.id ?? tracks[0]?.id ?? "";
  return { gameId, folderPath: resolve(root, "music", gameId),
    defaultThemeId: themes.find(theme => theme.id === defaultId || theme.formatAliases?.includes(defaultId))?.id ?? "",
    themes };
}

export async function validateMenuMusicSelection(root: string, request: unknown, steamPath: string | null = null): Promise<{ gameId: MusicGameId; themeId: string }> {
  const parsed = menuMusicRequest.parse(request);
  const library = await getMenuMusicLibrary(root, parsed.gameId, steamPath);
  if (!library.themes.some(theme => theme.id === parsed.themeId)) throw new Error("This music file is no longer available. Refresh the music list.");
  return parsed;
}

/** URLs contain opaque catalog IDs, never user-controlled filesystem path segments. */
export async function resolveMenuMusicFile(root: string, url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== `${MUSIC_PROTOCOL}:` || parsed.username || parsed.password || parsed.port) throw new Error("Invalid music URL.");
  const request = menuMusicRequest.parse({ gameId: parsed.hostname, themeId: parsed.pathname.slice(1) });
  const track = (await localTracks(root, request.gameId)).find(item => item.id === request.themeId);
  if (!track) throw new Error("Music file is unavailable.");
  return track.file;
}
