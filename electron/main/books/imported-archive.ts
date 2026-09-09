import { execFile } from "node:child_process";
import { dirname, join } from "node:path";

export interface ArchivePage { name: string; size: number }
const MAX_IMAGE_BYTES = 64 * 1024 ** 2;
const MAX_ENTRIES = 10000;

function runArchive(args: string[], maxBuffer: number): Promise<Buffer> {
  // The executable and its companion DLL must be unpacked together by electron-builder.
  const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
  const binary = process.platform === "win32" ? "7z.exe" : "7zz";
  const executable = join(dirname(require.resolve("7zip-bin-full/package.json")), platform, process.arch, binary)
    .replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, encoding: "buffer", maxBuffer, timeout: 60000 }, (error, output) => {
      if (error) reject(new Error("Unable to read this comic archive. It may be damaged, encrypted, or exceed the reader limits."));
      else resolve(output);
    });
  });
}
export function parseArchivePages(listing: string): ArchivePage[] {
  const pages: ArchivePage[] = [];
  let total = 0;
  const entries = listing.split(/\r?\n\r?\n/).filter(block => /^Path = /m.test(block));
  if (entries.length > MAX_ENTRIES) throw new Error("Comic archive contains too many entries");
  for (const block of entries) {
    const name = /^Path = (.*)$/m.exec(block)?.[1]?.replace(/\r$/, "") ?? "";
    if (!name || name.length > 1024 || /[\x00-\x1f:*?]/.test(name) || /^[\\/]/.test(name) || name.split(/[\\/]/).some(part => part === ".." || part === ".")) throw new Error("Unsafe path inside comic archive");
    if (/^(?:Symbolic Link|Hard Link) = .+/m.test(block)) throw new Error("Comic archives cannot contain links");
    if (/^Encrypted = \+/m.test(block)) throw new Error("Password-protected comic archives are not supported");
    if (/^Folder = \+/m.test(block) || !/\.(?:jpe?g|png|webp|gif|bmp)$/i.test(name)) continue;
    const size = Number(/^Size = (\d+)\r?$/m.exec(block)?.[1]);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES) throw new Error("Comic page exceeds the 64 MB image limit");
    total += size;
    if (total > 8 * 1024 ** 3) throw new Error("Comic archive exceeds the expanded size limit");
    pages.push({ name, size });
  }
  if (!pages.length) throw new Error("No supported page images found in this comic archive");
  const seen = new Set<string>();
  for (const page of pages) {
    const key = page.name.toLowerCase();
    if (seen.has(key)) throw new Error("Comic archive contains duplicate page names");
    seen.add(key);
  }
  return pages.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
}
export async function archivePages(file: string): Promise<ArchivePage[]> {
  const listing = await runArchive(["l", "-slt", "-ba", "-sccUTF-8", "-p-", "--", file], 8 * 1024 ** 2);
  return parseArchivePages(listing.toString("utf8"));
}
export async function archivePage(file: string, page: ArchivePage): Promise<Buffer> {
  // Stream exactly one named entry to stdout; archive names never become output paths.
  const bytes = await runArchive(["x", "-so", "-spd", "-bd", "-p-", "--", file, page.name], MAX_IMAGE_BYTES);
  if (bytes.length !== page.size) throw new Error("Comic page size does not match the archive index");
  return bytes;
}
