import { useCallback, useState } from "react";
import type { BookEntry } from "@shared/books";

/** File discovery only. Book contents are extracted when a reader requests them. */
export function useBooksCatalog() {
  const [catalog, setCatalog] = useState<BookEntry[]>([]);
  const preload = useCallback(async () => {
    try {
      const result = await window.hub.getBooksCatalog();
      if (result.ok) setCatalog(result.value);
    } catch { /* Optional books must not prevent startup or game launch. */ }
  }, []);
  return { catalog, preload };
}
