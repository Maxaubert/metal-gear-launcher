import type { BookRequest } from "@shared/books";
import type { PreparationFailure } from "@shared/preparation";
import type { PreparationTask } from "../preparation/types";
import { type BookInstall, metadataSource, bookTitle } from "./discovery";
import { NativeBooks, type NativeBook } from "./native";
import { readerPages } from "./pages";

export function referencedBookImages(book: NativeBook): string[] {
  return [...new Set([...book.pages.map(row => row.backgroundImage), ...book.backgrounds.map(row => row.text)]
    .filter((name): name is string => typeof name === "string" && !!name && name.toLowerCase() !== "null_pic"))];
}
export function bookImageIdentity(request: BookRequest, name: string, mapping: Record<string, string>): string {
  let source = Object.entries(mapping).find(([alias]) => alias.toLowerCase() === name.toLowerCase())?.[1] ?? name;
  if (request.gameId === "mgs4" && source.toLowerCase() === "johhny") source = "johnny";
  return `${request.gameId}:${request.kind}:${source.toLowerCase()}`;
}

/** Decode each language's metadata once, then plan each distinct referenced native image once. */
export async function planBooks(installs: BookInstall[], dataDir: string, onMetadata: (completed: number, total: number, label: string) => void): Promise<{ tasks: PreparationTask[]; failures: PreparationFailure[] }> {
  const requests: { native: NativeBooks; request: BookRequest }[] = [];
  for (const install of installs) {
    const native = new NativeBooks(install, dataDir);
    for (const kind of ["master", "screenplay"] as const) for (const language of ["en", "jp"] as const) {
      if (install.gameId === "mgs1" || await metadataSource(install, kind, language, "page")) requests.push({ native, request: { gameId: install.gameId, kind, language } });
    }
  }
  const tasks = new Map<string, PreparationTask>(); const failures: PreparationFailure[] = [];
  let completed = 0; let next = 0;
  onMetadata(0, requests.length, "Reading book indexes");
  await Promise.all(Array.from({ length: Math.min(4, requests.length) }, async () => {
    for (;;) {
      const item = requests[next++]; if (!item) return;
      const { native, request } = item;
      const label = `${native.install.title}: ${bookTitle(request.kind)} (${request.language.toUpperCase()})`;
      try {
        const book = await native.book(request);
        readerPages(book, request.kind);
        for (const name of referencedBookImages(book)) {
          const id = bookImageIdentity(request, name, book.mapping);
          if (!tasks.has(id)) tasks.set(id, { id, label: `${label}: ${name}`, run: async () => { await native.image(request, name, book.mapping); } });
        }
      } catch (error) { failures.push({ id: `book:${request.gameId}:${request.kind}:${request.language}`, label, error: error instanceof Error ? error.message : String(error) }); }
      onMetadata(++completed, requests.length, label);
    }
  }));
  return { tasks: [...tasks.values()], failures };
}
