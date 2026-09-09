import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { digest, filesIn } from "../books/cache";
import { extractorIdentity } from "../extract/identity";

const fileStamp = z.object({ file: z.string(), size: z.number(), modified: z.number(), content: z.string().optional() });
const snapshotSchema = z.object({ version: z.literal(1), fingerprint: z.string(), sources: z.array(fileStamp), files: z.array(fileStamp), total: z.number().int().nonnegative() });
export type FileStamp = z.infer<typeof fileStamp>;
export type PreparationSnapshot = z.infer<typeof snapshotSchema>;
export async function stamp(file: string): Promise<FileStamp> {
  try { const info = await stat(file); return { file, size: info.isFile() ? info.size : -1, modified: info.mtimeMs }; }
  catch { return { file, size: -1, modified: -1 }; }
}
export async function stampFiles(files: string[]): Promise<FileStamp[]> {
  const ordered = [...new Set(files)].sort();
  const result: FileStamp[] = [];
  for (let index = 0; index < ordered.length; index += 64) result.push(...await Promise.all(ordered.slice(index, index + 64).map(stamp)));
  return result;
}
export async function stampExtractor(file: string): Promise<FileStamp> {
  const info = await stamp(file);
  if (info.size < 0) return { file, size: -1, modified: -1 };
  return { file, size: info.size, modified: 0, content: await extractorIdentity(file) };
}
export function sourceFingerprint(identity: unknown, sources: FileStamp[]): string { return digest(JSON.stringify([1, identity, sources])); }
const path = (dataDir: string) => join(dataDir, "preparation", "complete.json");
export async function readSnapshot(dataDir: string): Promise<PreparationSnapshot | undefined> {
  try { return snapshotSchema.parse(JSON.parse(await readFile(path(dataDir), "utf8"))); } catch { return undefined; }
}
function inside(dataDir: string, file: string): boolean {
  const rel = relative(resolve(dataDir), resolve(dataDir, file));
  return !isAbsolute(file) && !!rel && !isAbsolute(rel) && !rel.split(/[\\/]/).includes("..");
}
export async function changedCacheFiles(dataDir: string, snapshot?: PreparationSnapshot): Promise<string[]> {
  if (!snapshot) return [];
  const changed: string[] = [];
  for (let index = 0; index < snapshot.files.length; index += 64) await Promise.all(snapshot.files.slice(index, index + 64).map(async previous => {
    if (!inside(dataDir, previous.file)) { changed.push(previous.file); return; }
    const file = join(dataDir, previous.file); const current = await stamp(file);
    if (current.size !== previous.size || current.modified !== previous.modified) changed.push(file);
  }));
  return changed;
}
export async function cacheStamps(dataDir: string, roots: string[]): Promise<FileStamp[]> {
  const files: string[] = [];
  for (const root of roots) {
    try { files.push(...(await filesIn(root)).filter(file => !relative(root, file).split(/[\\/]/).some(part => part.startsWith(".extract-") || part.startsWith("extract-") || part.endsWith(".tmp")))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const records = await stampFiles(files);
  if (records.some(record => record.size < 0)) throw new Error("Prepared files changed during verification. Retry preparation.");
  return records.map(record => {
    const file = relative(dataDir, record.file);
    if (!inside(dataDir, file)) throw new Error("Prepared cache lies outside the launcher data folder");
    return { ...record, file };
  });
}
export async function writeSnapshot(dataDir: string, snapshot: PreparationSnapshot): Promise<void> {
  const destination = path(dataDir); const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  try { await writeFile(temporary, JSON.stringify(snapshot)); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
}
