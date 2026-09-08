import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_MENU_MUSIC_FILENAMES, MENU_THEMES, MUSIC_PROTOCOL, menuMusicRequest, type MenuMusicLibrary, type MusicGameId } from "../../../shared/menuMusic";
import { settingsGameId } from "../../../shared/settings";

export const MUSIC_CONTENT_TYPES: Record<string, string> = {
  ".flac": "audio/flac", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
};
export const musicFileId = (gameId: MusicGameId, filename: string): string =>
  `${gameId}-file-${createHash("sha256").update(filename).digest("hex")}`;

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

export async function getMenuMusicLibrary(root: string, gameId: MusicGameId): Promise<MenuMusicLibrary> {
  settingsGameId.parse(gameId);
  const tracks = await localTracks(root, gameId);
  const desiredFile = DEFAULT_MENU_MUSIC_FILENAMES[gameId];
  const desiredId = desiredFile ? musicFileId(gameId, desiredFile) : undefined;
  return { gameId, folderPath: resolve(root, "music", gameId),
    defaultThemeId: tracks.find(track => track.id === desiredId)?.id ?? `${gameId}-original`,
    themes: [...MENU_THEMES[gameId], ...tracks.map(track => ({ id: track.id, label: track.label,
      url: `${MUSIC_PROTOCOL}://${gameId}/${track.id}?v=${track.revision}` }))] };
}

export async function validateMenuMusicSelection(root: string, request: unknown): Promise<{ gameId: MusicGameId; themeId: string }> {
  const parsed = menuMusicRequest.parse(request);
  const library = await getMenuMusicLibrary(root, parsed.gameId);
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
