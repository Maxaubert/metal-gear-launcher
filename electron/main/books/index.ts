import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { bookPageRequest, bookRequest, type BookDocument, type BookEntry, type BookPage, type BookPageRequest, type BookRequest } from "@shared/books";
import { allowBonusFile } from "../bonus/media";
import { bookTitle, catalog, discoverBooks } from "./discovery";
import { NativeBooks } from "./native";
import { nativeContents, pageAssets, readerPages } from "./pages";

export async function getBooksCatalog(steamPath: string | null, dataDir: string): Promise<BookEntry[]> {
  // Discovery deliberately leaves the cache untouched; this parameter keeps the service API uniform.
  void dataDir;
  return catalog(steamPath);
}

async function openNative(steamPath: string | null, dataDir: string, request: BookRequest) {
  const install = (await discoverBooks(steamPath)).find(item => item.gameId === request.gameId);
  if (!install) throw new Error("Install this game in Steam to read its books");
  const native = new NativeBooks(install, dataDir);
  const book = await native.book(request);
  const pages = readerPages(book, request.kind);
  return { native, book, pages };
}
function progressFile(dataDir: string, request: BookRequest): string {
  return join(dataDir, "book-cache", "progress", `${request.gameId}-${request.kind}-${request.language}.json`);
}
async function progress(dataDir: string, request: BookRequest, count: number): Promise<number> {
  try {
    await saves.get(progressFile(dataDir, request));
    const value: unknown = JSON.parse(await readFile(progressFile(dataDir, request), "utf8"));
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? Math.min(value, count - 1) : 0;
  } catch { return 0; }
}

export async function openBook(steamPath: string | null, dataDir: string, input: BookRequest): Promise<BookDocument> {
  const request = bookRequest.parse(input);
  const { book, pages } = await openNative(steamPath, dataDir, request);
  return { ...request, title: bookTitle(request.kind), pageCount: pages.length, lastPage: await progress(dataDir, request, pages.length), contents: nativeContents(book, pages) };
}

export async function getBookPage(steamPath: string | null, dataDir: string, input: BookPageRequest): Promise<BookPage> {
  const request = bookPageRequest.parse(input);
  const { book, pages, native } = await openNative(steamPath, dataDir, request);
  const row = pages[request.page];
  if (!row) throw new Error("This book page does not exist");
  const assets = pageAssets(book, row.pageNo, request.gameId);
  const urls = async (name: string): Promise<string[]> => Promise.all((await native.image(request, name, book.mapping)).map(file => allowBonusFile(file, native.root, "image/png", "books")));
  const [base, ...artwork] = await Promise.all([urls(assets.base), ...assets.artwork.map(urls)]);
  return {
    page: request.page, nativePage: row.pageNo,
    title: typeof row.pageTitle === "string" ? row.pageTitle : `${bookTitle(request.kind)} ${request.page + 1}`,
    imageUrl: base?.[0], artworkUrls: artwork.map(items => items[0] ?? ""),
    columns: Object.entries(row).filter(([id, value]) => /^TextArea[AB][0-3]$/.test(id) && typeof value === "string")
      .sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => ({ id, markup: value as string })),
  };
}

const saves = new Map<string, Promise<void>>();
export async function saveBookProgress(dataDir: string, input: BookPageRequest): Promise<void> {
  const request = bookPageRequest.parse(input);
  const file = progressFile(dataDir, request);
  const save = (saves.get(file) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    await mkdir(join(dataDir, "book-cache", "progress"), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(request.page));
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  });
  saves.set(file, save);
  try { await save; } finally { if (saves.get(file) === save) saves.delete(file); }
}
