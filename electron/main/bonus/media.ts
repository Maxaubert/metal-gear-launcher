import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

type MediaFile = { file: string; contentType: string; root: string; size: number; modified: number };
const files = new Map<string, MediaFile>();
// Book paging must never evict long-lived menu music, videos or launcher artwork.
const bookFiles = new Map<string, MediaFile>();
export async function allowBonusFile(file: string, root: string, contentType: string, scope: "library" | "books" = "library"): Promise<string> {
  const [canonicalFile, canonicalRoot, info] = await Promise.all([realpath(file), realpath(root), stat(file)]);
  const rel = relative(canonicalRoot, canonicalFile);
  if (!info.isFile() || isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw new Error("Bonus media outside installation");
  const id = createHash("sha256").update(`${scope}\0${canonicalFile}\0${info.size}\0${info.mtimeMs}`).digest("hex");
  const pool = scope === "books" ? bookFiles : files;
  const limit = scope === "books" ? 2048 : 1024;
  if (pool.size >= limit && !pool.has(id)) pool.delete(pool.keys().next().value!);
  pool.set(id, { file: canonicalFile, root: canonicalRoot, contentType, size: info.size, modified: info.mtimeMs });
  return `hub-bonus://media/${id}`;
}

export async function resolveBonusFile(url: string): Promise<{ file: string; contentType: string }> {
  // Validate the original string before URL normalization can erase traversal segments.
  const id = /^hub-bonus:\/\/media\/([a-f0-9]{64})$/.exec(url)?.[1];
  const entry = id && (files.get(id) ?? bookFiles.get(id));
  if (!entry) throw new Error("Unknown bonus media");
  const [canonical, info] = await Promise.all([realpath(entry.file), stat(entry.file)]);
  if (canonical !== entry.file || !info.isFile() || info.size !== entry.size || info.mtimeMs !== entry.modified) throw new Error("Bonus media changed; refresh the library");
  return { file: entry.file, contentType: entry.contentType };
}
