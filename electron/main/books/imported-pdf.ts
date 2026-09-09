import { createCanvas } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PDFDocumentProxy } from "pdfjs-dist";

let current: { identity: string; document: PDFDocumentProxy; destroy: () => Promise<void> } | undefined;
/** Called inside the personal-reader queue, so disposal never interrupts another page render. */
export async function importedPdf(file: string, identity: string): Promise<PDFDocumentProxy> {
  if (current?.identity === identity) return current.document;
  if (current) { await current.destroy(); current = undefined; }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = dirname(require.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/");
  const task = getDocument({
    data: new Uint8Array(await readFile(file)), useSystemFonts: false,
    cMapUrl: `${root}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${root}/standard_fonts/`,
    wasmUrl: `${root}/wasm/`,
    maxImageSize: 40_000_000, canvasMaxAreaInBytes: 160_000_000,
  });
  let document: PDFDocumentProxy;
  try { document = await task.promise; }
  catch (error) { await task.destroy(); throw error; }
  if (document.numPages < 1 || document.numPages > 10000) { await task.destroy(); throw new Error("PDF exceeds the 10,000-page limit"); }
  current = { identity, document, destroy: () => task.destroy() };
  return document;
}
export async function pdfContents(document: PDFDocumentProxy): Promise<{ title: string; page: number }[]> {
  const result: { title: string; page: number }[] = [];
  try {
    const pending = [...(await document.getOutline() ?? [])];
    let visited = 0;
    while (pending.length && result.length < 500 && visited++ < 2000) {
      const item = pending.shift()!;
      pending.unshift(...item.items);
      const destination = typeof item.dest === "string" ? await document.getDestination(item.dest) : item.dest;
      if (!Array.isArray(destination) || destination.length === 0) continue;
      const ref = destination[0];
      const page = typeof ref === "number" ? ref : await document.getPageIndex(ref);
      if (page >= 0 && page < document.numPages) result.push({ title: item.title, page });
    }
  } catch { /* A malformed outline does not prevent reading the PDF itself. */ }
  return result;
}
export async function renderPdfPage(document: PDFDocumentProxy, index: number): Promise<Buffer> {
  const page = await document.getPage(index + 1);
  try {
    const natural = page.getViewport({ scale: 1 });
    if (!Number.isFinite(natural.width) || !Number.isFinite(natural.height) || natural.width <= 0 || natural.height <= 0) throw new Error("Invalid PDF page dimensions");
    const scale = Math.min(3200 / Math.max(natural.width, natural.height), Math.sqrt(8_000_000 / (natural.width * natural.height)));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    // PDF.js accepts the native canvas at runtime; its public types target the browser DOM.
    await page.render({ canvas: canvas as never, canvasContext: canvas.getContext("2d") as never, viewport }).promise;
    return await canvas.encode("png");
  } finally { page.cleanup(); }
}
