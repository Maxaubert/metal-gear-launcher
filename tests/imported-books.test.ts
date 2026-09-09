import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { path7z } from "7zip-bin-full";
import sharp from "sharp";
import { importBookPaths, importedCatalog, openBook, getBookPage, saveBookProgress, removeImportedBook } from "../electron/main/books";
import { parseArchivePages } from "../electron/main/books/imported-archive";
import { resolveBonusFile } from "../electron/main/bonus/media";

let root: string; let data: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "personal-books-")); data = join(root, "data"); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function pdf(): string {
  const bodies = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << >> >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << >> >>"];
  let source = "%PDF-1.4\n"; const offsets = [0];
  bodies.forEach((body, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  return source + `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
const request = (id: string) => ({ gameId: "mgs1", kind: "master", language: "en", importedId: id }) as const;
describe("personal library service", () => {
  it("imports folders recursively, keeps original PDFs, deduplicates paths, and retains missing books", async () => {
    const folder = join(root, "library"); await mkdir(join(folder, "nested"), { recursive: true });
    const file = join(folder, "nested", "My Novel.PDF"); await writeFile(file, pdf());
    await writeFile(join(folder, "notes.txt"), "ignored");
    const first = await importBookPaths(data, [folder]);
    expect(first).toHaveLength(1); expect(first[0]).toMatchObject({ title: "My Novel", format: "pdf", available: true });
    expect((await importBookPaths(data, [file]))[0]?.importedId).toBe(first[0]?.importedId);
    expect(await readFile(file, "utf8")).toBe(pdf());
    await rename(file, `${file}.moved`);
    expect((await importedCatalog(data))[0]?.available).toBe(false);
    await expect(openBook(null, data, request(first[0]!.importedId!))).rejects.toThrow("unavailable");
    await removeImportedBook(data, first[0]!.importedId!);
    expect(await importedCatalog(data)).toEqual([]);
    expect(await readFile(`${file}.moved`, "utf8")).toBe(pdf());
  });
  it("renders PDF pages, caches output, saves progress separately from disposable caches, and enforces bounds", async () => {
    const file = join(root, "novel.pdf"); await writeFile(file, pdf());
    const entry = (await importBookPaths(data, [file]))[0]!; const req = request(entry.importedId!);
    expect(await openBook(null, data, req)).toMatchObject({ title: "novel", pageCount: 2, lastPage: 0 });
    const first = await getBookPage(null, data, { ...req, page: 1 });
    const media = await resolveBonusFile(first.imageUrl!);
    expect(await sharp(media.file).metadata()).toMatchObject({ format: "png", width: 3200 });
    await saveBookProgress(data, { ...req, page: 1 });
    await rm(join(data, "book-cache"), { recursive: true, force: true });
    expect((await openBook(null, data, req)).lastPage).toBe(1);
    await expect(getBookPage(null, data, { ...req, page: 2 })).rejects.toThrow("does not exist");
    await expect(getBookPage(null, data, { ...req, page: -1 })).rejects.toThrow();
    await expect(openBook(null, data, { ...req, importedId: "../../secret" })).rejects.toThrow();
  });
  it("reads CBZ images in natural order without unpacking arbitrary archive paths", async () => {
    const source = join(root, "images"); await mkdir(source);
    for (const [name, color] of [["page10.png", "blue"], ["page2.png", "red"]]) await sharp({ create: { width: 20, height: 30, channels: 3, background: color! } }).png().toFile(join(source, name!));
    const file = join(root, "comic.cbz");
    await promisify(execFile)(path7z, ["a", "-tzip", file, "page10.png", "page2.png"], { cwd: source, windowsHide: true });
    const entry = (await importBookPaths(data, [file]))[0]!; const req = request(entry.importedId!);
    expect((await openBook(null, data, req)).pageCount).toBe(2);
    const page = await getBookPage(null, data, { ...req, page: 0 });
    const media = await resolveBonusFile(page.imageUrl!);
    const raw = await sharp(media.file).raw().toBuffer();
    expect([...raw.subarray(0, 3)]).toEqual([255, 0, 0]);
    await expect(getBookPage(null, data, { ...req, page: 2 })).rejects.toThrow("does not exist");
  });
  it("does not overwrite a corrupt registry or accept arbitrary renderer paths", async () => {
    await mkdir(join(data, "personal-books"), { recursive: true });
    await writeFile(join(data, "personal-books", "library.json"), "corrupt");
    const file = join(root, "novel.pdf"); await writeFile(file, pdf());
    await expect(importBookPaths(data, [file])).rejects.toThrow("could not be read");
    expect(await readFile(join(data, "personal-books", "library.json"), "utf8")).toBe("corrupt");
    await expect(importBookPaths(data, ["relative.pdf"])).rejects.toThrow("Choose book");
  });
});
describe("comic archive constraints", () => {
  const listing = (name: string, size = 20, extra = "") => `Path = ${name}\nSize = ${size}\n${extra}\n`;
  it("rejects traversal, absolute paths, links, oversized pages and duplicate names", () => {
    for (const name of ["../escape.png", "C:\\escape.png", "/escape.png", "nested/../escape.png", "x.png:stream"]) expect(() => parseArchivePages(listing(name))).toThrow("Unsafe");
    expect(() => parseArchivePages(listing("safe.png", 20, "Symbolic Link = target"))).toThrow("links");
    expect(() => parseArchivePages(listing("safe.png", 65 * 1024 ** 2))).toThrow("64 MB");
    expect(() => parseArchivePages(listing("safe.png") + listing("SAFE.png"))).toThrow("duplicate");
    expect(() => parseArchivePages(listing("safe.png", 20, "Encrypted = +"))).toThrow("Password");
    expect(() => parseArchivePages(Array.from({ length: 10001 }, (_, i) => listing(`${i}.png`)).join(""))).toThrow("too many");
  });
});
