import { randomUUID } from "node:crypto";
import { copyFile, link, lstat, readdir, realpath, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { settingsGameId } from "../../../shared/settings";
import { ensureMenuMusicFolder, MUSIC_CONTENT_TYPES } from "./library";

const stem = (filename: string): string => filename.slice(0, -extname(filename).length).toLowerCase();

/** Optional build media seeds missing tracks only. Existing user files and configuration win. */
export async function seedBundledMenuMusic(dataRoot: string, packRoot: string): Promise<{ added: number; skipped: number }> {
  const result = { added: 0, skipped: 0 };
  try { if (!(await lstat(packRoot)).isDirectory()) return result; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return result; throw error; }
  const canonicalPack = await realpath(packRoot);
  for (const gameId of settingsGameId.options) {
    const source = join(canonicalPack, gameId);
    let entries;
    try {
      const info = await lstat(source);
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
      entries = await readdir(source, { withFileTypes: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    const media = entries.filter(entry => entry.isFile() && MUSIC_CONTENT_TYPES[extname(entry.name).toLowerCase()]);
    if (!media.length) continue;
    const destination = await ensureMenuMusicFolder(dataRoot, gameId);
    // A FLAC already imported by the user is the same song as the pack's MP3.
    const existing = new Set((await readdir(destination)).filter(name => MUSIC_CONTENT_TYPES[extname(name).toLowerCase()]).map(stem));
    for (const entry of media) {
      if (existing.has(stem(entry.name))) { result.skipped++; continue; }
      const temporary = join(destination, `.seed-${randomUUID()}.tmp`);
      try {
        await copyFile(join(source, entry.name), temporary);
        // Publish a completed copy without replacing a file created concurrently.
        await link(temporary, join(destination, entry.name));
        existing.add(stem(entry.name));
        result.added++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        result.skipped++;
      } finally { await rm(temporary, { force: true }); }
    }
  }
  return result;
}
