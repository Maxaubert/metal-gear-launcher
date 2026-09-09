import type { BookRequest } from "@shared/books";
import type { NativeBook, NativeRow } from "./native";

export function readerPages(book: NativeBook, kind: BookRequest["kind"]): NativeRow[] {
  const rows = (kind === "screenplay" ? book.text : book.pages).filter(row => row.pageNo > 0);
  if (!rows.length || new Set(rows.map(row => row.pageNo)).size !== rows.length) throw new Error("Book has invalid page identifiers");
  return rows.sort((a, b) => a.pageNo - b.pageNo);
}
export function nativeContents(book: NativeBook, pages: NativeRow[]): { title: string; page: number }[] {
  return book.index.flatMap(row => {
    const page = pages.findIndex(item => item.pageNo === row.pageNo);
    return page >= 0 && typeof row.text === "string" ? [{ title: row.text, page }] : [];
  });
}
export function pageAssets(book: NativeBook, nativePage: number, gameId: BookRequest["gameId"]): { base: string; artwork: string[] } {
  const frame = book.pages.filter(row => row.pageNo <= nativePage).sort((a, b) => b.pageNo - a.pageNo)[0];
  const artwork = ["", ""];
  const changes = [...book.backgrounds].sort((a, b) => Number(gameId === "mgs1" ? a.groupid : a.pageNo) - Number(gameId === "mgs1" ? b.groupid : b.pageNo));
  for (const row of changes) {
    const page = gameId === "mgs1" ? Number(row.groupid) : row.pageNo;
    const slot = Number(row.nextgroupid);
    if (page <= nativePage && (slot === 0 || slot === 1) && typeof row.text === "string") artwork[slot] = row.text;
  }
  return { base: typeof frame?.backgroundImage === "string" ? frame.backgroundImage : "", artwork };
}
