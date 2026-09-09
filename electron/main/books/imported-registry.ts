import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { BookEntry } from "@shared/books";

const itemSchema = z.object({ id: z.string().uuid(), path: z.string().refine(isAbsolute), title: z.string().max(1024), format: z.enum(["pdf", "cbz", "cbr"]), lastPage: z.number().int().min(0).max(10000).default(0) });
const registrySchema = z.object({ version: z.literal(1), books: z.array(itemSchema).max(2000) });
export type ImportedRecord = z.infer<typeof itemSchema>;
const mutations = new Map<string, Promise<unknown>>();
export const personalBooksRoot = (dataDir: string) => join(dataDir, "personal-books");
const registryFile = (dataDir: string) => join(personalBooksRoot(dataDir), "library.json");

/** Windows scanners can briefly deny replacement. Preserve the old registry while retrying. */
export async function publishImportedRegistry(temporary: string, file: string, platform = process.platform): Promise<void> {
  const waits = [25, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try { await rename(temporary, file); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "") || attempt >= waits.length) throw error;
      await delay(waits[attempt]);
    }
  }
}

export async function readImportedRegistry(dataDir: string): Promise<ImportedRecord[]> {
  try { return registrySchema.parse(JSON.parse(await readFile(registryFile(dataDir), "utf8"))).books; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw new Error("The personal book library could not be read. Restore its library.json backup before importing more books."); }
}
async function mutate(dataDir: string, change: (books: ImportedRecord[]) => Promise<ImportedRecord[]>): Promise<void> {
  const file = registryFile(dataDir);
  const operation = (mutations.get(file) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const books = await change(await readImportedRegistry(dataDir));
    registrySchema.parse({ version: 1, books });
    await mkdir(personalBooksRoot(dataDir), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, books }, null, 2));
      await publishImportedRegistry(temporary, file);
    } finally { await rm(temporary, { force: true }); }
  });
  mutations.set(file, operation);
  try { await operation; } finally { if (mutations.get(file) === operation) mutations.delete(file); }
}
const pathKey = (file: string) => process.platform === "win32" ? file.toLowerCase() : file;
export function importedEntry(book: ImportedRecord, available: boolean): BookEntry {
  return { gameId: "mgs1", kind: "master", title: book.title, gameTitle: "Personal Library", languages: ["en"], importedId: book.id, format: book.format, available };
}
export async function importedCatalog(dataDir: string): Promise<BookEntry[]> {
  return Promise.all((await readImportedRegistry(dataDir)).map(async book => {
    const available = await stat(book.path).then(info => info.isFile()).catch(() => false);
    return importedEntry(book, available);
  }));
}

/** Only the main-process file picker supplies paths. Renderer requests use registry UUIDs. */
export async function importBookPaths(dataDir: string, paths: string[]): Promise<BookEntry[]> {
  if (!paths.length || paths.length > 2000 || paths.some(file => !isAbsolute(file))) throw new Error("Choose book files or a books folder");
  const found = new Map<string, { path: string; format: ImportedRecord["format"] }>();
  let visited = 0;
  async function walk(file: string, depth: number): Promise<void> {
    if (++visited > 20000 || depth > 20) throw new Error("Choose a smaller books folder (maximum 20,000 entries)");
    const info = await lstat(file);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) { for (const item of await readdir(file)) await walk(join(file, item), depth + 1); return; }
    const format = extname(file).slice(1).toLowerCase();
    if (!info.isFile() || !["pdf", "cbz", "cbr"].includes(format)) return;
    if (info.size > 2 * 1024 ** 3) throw new Error(`Book is larger than the 2 GB limit: ${basename(file)}`);
    const path = await realpath(file);
    found.set(pathKey(path), { path, format: format as ImportedRecord["format"] });
  }
  for (const file of paths) await walk(file, 0);
  if (!found.size) throw new Error("No PDF, CBZ or CBR books found in the selected files or folder");
  await mutate(dataDir, async books => {
    const existing = new Set(books.map(book => pathKey(book.path)));
    return [...books, ...[...found.entries()].filter(([key]) => !existing.has(key)).map(([, item]) => ({ ...item, id: randomUUID(), title: basename(item.path, extname(item.path)), lastPage: 0 }))];
  });
  return importedCatalog(dataDir);
}
export async function importedRecord(dataDir: string, id: string): Promise<ImportedRecord> {
  z.string().uuid().parse(id);
  const book = (await readImportedRegistry(dataDir)).find(item => item.id === id);
  if (!book) throw new Error("This book is not in your personal library");
  const info = await stat(book.path).catch(() => null);
  if (!info?.isFile()) throw new Error("This book is unavailable. Reconnect its drive or add the book from its new location.");
  if (info.size > 2 * 1024 ** 3) throw new Error("Book exceeds the 2 GB limit");
  return book;
}
export async function saveImportedProgress(dataDir: string, id: string, page: number): Promise<void> {
  await importedRecord(dataDir, id);
  await mutate(dataDir, async books => books.map(book => book.id === id ? { ...book, lastPage: page } : book));
}
export async function removeImportedBook(dataDir: string, id: string): Promise<void> {
  z.string().uuid().parse(id);
  await mutate(dataDir, async books => books.filter(book => book.id !== id));
}
