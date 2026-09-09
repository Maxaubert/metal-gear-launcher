import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const hashes = new Map<string, { stamp: string; hash: Promise<string> }>();
const MAX_FILES = 32;
async function fileStamp(file: string): Promise<string> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`Extractor file unavailable: ${file}`);
  return `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`;
}

/** Installer timestamps are unstable; extractor cache identities describe the actual bytes. */
export async function extractorIdentity(file: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const stamp = await fileStamp(file);
    let entry = hashes.get(file);
    if (entry?.stamp !== stamp) {
      entry = { stamp, hash: readFile(file).then(bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`) };
      hashes.set(file, entry);
      while (hashes.size > MAX_FILES) hashes.delete(hashes.keys().next().value!);
    } else { hashes.delete(file); hashes.set(file, entry); }
    try {
      const hash = await entry.hash;
      if (await fileStamp(file) === stamp) return hash;
    } catch (error) { if (hashes.get(file) === entry) hashes.delete(file); throw error; }
    if (hashes.get(file) === entry) hashes.delete(file);
  }
  throw new Error("Extractor changed while its identity was being verified. Retry preparation.");
}

export async function decoderIdentity(executable: string): Promise<string> {
  const version = extractorIdentity(join(dirname(executable), "VERSION")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "missing-version";
    throw error;
  });
  return JSON.stringify(await Promise.all([extractorIdentity(executable), version]));
}
