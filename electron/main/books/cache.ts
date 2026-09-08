import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { z } from "zod";

const resource = z.object({ file: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/) });
const manifest = z.object({ version: z.literal(1), files: z.array(resource).min(1) });
export const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const pending = new Map<string, Promise<string>>();

export async function fileIdentity(file: string): Promise<string> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Book source is unavailable");
  return `${file}:${info.size}:${info.mtimeMs}`;
}

export async function filesIn(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await filesIn(path));
    else if (item.isFile()) files.push(path);
  }
  return files;
}

async function valid(directory: string): Promise<boolean> {
  try {
    const data = manifest.parse(JSON.parse(await readFile(join(directory, "cache.json"), "utf8")));
    for (const entry of data.files) {
      if (isAbsolute(entry.file) || entry.file.split(/[\\/]/).includes("..")) return false;
      if (digest(await readFile(join(directory, entry.file))) !== entry.hash) return false;
    }
    return true;
  } catch { return false; }
}

/** Only a validated, complete temporary extraction can become a persistent entry. */
export function cachedExtraction(root: string, identity: string, extract: (temporary: string) => Promise<void>): Promise<string> {
  const directory = join(root, digest(identity));
  const existing = pending.get(directory);
  if (existing) return existing;
  const operation = (async () => {
    if (await valid(directory)) return directory;
    await mkdir(root, { recursive: true });
    const temporary = await mkdtemp(join(root, ".extract-"));
    try {
      await extract(temporary);
      const files = await filesIn(temporary);
      if (!files.length) throw new Error("Book extraction produced no content");
      await writeFile(join(temporary, "cache.json"), JSON.stringify({ version: 1, files: await Promise.all(files.map(async file => ({ file: relative(temporary, file), hash: digest(await readFile(file)) }))) }));
      await rm(directory, { recursive: true, force: true });
      await rename(temporary, directory);
      return directory;
    } finally { await rm(temporary, { recursive: true, force: true }); }
  })();
  pending.set(directory, operation);
  void operation.finally(() => pending.delete(directory)).catch(() => undefined);
  return operation;
}
