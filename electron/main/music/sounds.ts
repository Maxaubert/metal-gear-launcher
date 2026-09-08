import { lstat, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { MENU_SOUNDS, type MenuSoundData } from "../../../shared/menuSounds";

const MAX_SOUND_BYTES = 4 * 1024 * 1024;

export async function readMenuSounds(root: string): Promise<MenuSoundData> {
  const result: MenuSoundData = {};
  const folder = join(root, "sounds");
  // User-supplied sounds are optional. Never require one particular game's installation.
  for (const sound of MENU_SOUNDS) {
    try {
      const file = join(folder, `${sound}.wav`);
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SOUND_BYTES) continue;
      const resolvedRoot = await realpath(root);
      const resolvedFile = await realpath(file);
      const within = relative(resolvedRoot, resolvedFile);
      if (within.startsWith("..") || within !== join("sounds", `${sound}.wav`)) continue;
      const bytes = await readFile(resolvedFile);
      if (bytes.length > MAX_SOUND_BYTES || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") continue;
      result[sound] = bytes.toString("base64");
    } catch { /* Missing or unreadable optional clips leave that action silent. */ }
  }
  return result;
}
