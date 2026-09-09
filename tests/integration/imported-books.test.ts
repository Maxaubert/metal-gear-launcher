import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importBookPaths, getBookPage, openBook } from "../../electron/main/books";
import { resolveBonusFile } from "../../electron/main/bonus/media";
import sharp from "sharp";

// Optional read-only check against a personal library. No source material belongs in the repository.
const paths: string[] = process.env.HUB_TEST_BOOK_PATHS ? JSON.parse(process.env.HUB_TEST_BOOK_PATHS) : [];
it.skipIf(!paths.length)("opens and renders a page from every supplied personal book", async () => {
  const root = await mkdtemp(join(tmpdir(), "personal-books-real-"));
  try {
    const books = await importBookPaths(root, paths);
    expect(books.length).toBeGreaterThan(0);
    for (const entry of books) {
      const request = { gameId: entry.gameId, kind: entry.kind, language: "en", importedId: entry.importedId } as const;
      const started = performance.now();
      const document = await openBook(null, root, request);
      expect(document.pageCount).toBeGreaterThan(0);
      const page = await getBookPage(null, root, { ...request, page: Math.min(2, document.pageCount - 1) });
      const metadata = await sharp((await resolveBonusFile(page.imageUrl!)).file).metadata();
      expect(metadata.width).toBeGreaterThan(0);
      console.info(`${entry.title}: ${document.pageCount} pages, first render ${Math.round(performance.now() - started)} ms`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 180000);
