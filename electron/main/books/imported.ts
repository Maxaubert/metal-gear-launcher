import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { BookDocument, BookPage, BookPageRequest, BookRequest } from "@shared/books";
import { allowBonusFile } from "../bonus/media";
import { archivePage, archivePages, type ArchivePage } from "./imported-archive";
import { importedPdf, pdfContents, renderPdfPage } from "./imported-pdf";
import { importedRecord } from "./imported-registry";
export { importBookPaths, importedCatalog, removeImportedBook, saveImportedProgress } from "./imported-registry";

let readerQueue: Promise<unknown> = Promise.resolve();
function inReader<T>(work: () => Promise<T>): Promise<T> {
  const result = readerQueue.catch(() => undefined).then(work);
  readerQueue = result.catch(() => undefined);
  return result;
}
const indexes = new Map<string, ArchivePage[]>();
async function comicIndex(file: string, identity: string) {
  let pages = indexes.get(identity);
  if (!pages) {
    pages = await archivePages(file);
    if (indexes.size >= 8) indexes.delete(indexes.keys().next().value!);
    indexes.set(identity, pages);
  }
  return pages;
}
async function source(dataDir: string, request: BookRequest) {
  if (!request.importedId) throw new Error("Choose a personal book");
  const book = await importedRecord(dataDir, request.importedId);
  const info = await stat(book.path);
  if (book.format === "pdf" && info.size > 512 * 1024 ** 2) throw new Error("PDF exceeds the 512 MB limit");
  const identity = createHash("sha256").update(JSON.stringify([1, book.id, book.path, info.size, info.mtimeMs])).digest("hex");
  return { book, identity };
}
export async function openImportedBook(dataDir: string, request: BookRequest): Promise<BookDocument> {
  return inReader(async () => {
    const { book, identity } = await source(dataDir, request);
    const pdf = book.format === "pdf" ? await importedPdf(book.path, identity) : null;
    const count = pdf ? pdf.numPages : (await comicIndex(book.path, identity)).length;
    const contents = pdf ? await pdfContents(pdf) : [];
    return { ...request, title: book.title, pageCount: count, lastPage: Math.min(book.lastPage, count - 1), contents };
  });
}

async function pruneCache(root: string, keep: string): Promise<void> {
  const rows = await Promise.all((await readdir(root)).filter(name => /^[a-f0-9]{64}-\d+\.png$/.test(name)).map(async name => ({ file: join(root, name), info: await stat(join(root, name)) })));
  rows.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
  let bytes = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!; bytes += row.info.size;
    if (row.file !== keep && (index >= 64 || bytes > 256 * 1024 ** 2)) await rm(row.file, { force: true });
  }
}
export async function getImportedPage(dataDir: string, request: BookPageRequest): Promise<BookPage> {
  return inReader(async () => {
    const { book, identity } = await source(dataDir, request);
    const root = join(dataDir, "book-cache", "personal-pages");
    const file = join(root, `${identity}-${request.page}.png`);
    let valid = false;
    try { await sharp(await readFile(file), { limitInputPixels: 40_000_000 }).metadata(); valid = true; } catch { /* Rebuild a missing or damaged page cache. */ }
    if (!valid) {
      let image: Buffer;
      if (book.format === "pdf") {
        const pdf = await importedPdf(book.path, identity);
        if (request.page >= pdf.numPages) throw new Error("This book page does not exist");
        image = await renderPdfPage(pdf, request.page);
      } else {
        const page = (await comicIndex(book.path, identity))[request.page];
        if (!page) throw new Error("This book page does not exist");
        image = await sharp(await archivePage(book.path, page), { limitInputPixels: 40_000_000, pages: 1 })
          .rotate().resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      }
      await mkdir(root, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, image); await rename(temporary, file); }
      finally { await rm(temporary, { force: true }); }
    }
    await pruneCache(root, file);
    return { page: request.page, nativePage: request.page, title: `${book.title} ${request.page + 1}`, imageUrl: await allowBonusFile(file, root, "image/png", "books"), artworkUrls: [], columns: [] };
  });
}
