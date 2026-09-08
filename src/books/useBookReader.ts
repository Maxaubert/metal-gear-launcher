import { useEffect, useRef, useState } from "react";
import type { BookDocument, BookPage, BookRequest } from "@shared/books";

function decodeImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error("A book image took too long to load.")), 30000);
    image.onload = () => { window.clearTimeout(timer); resolve(); };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("A book image could not be loaded.")); };
    image.src = url;
  });
}

export function useBookReader(request: BookRequest) {
  const [document, setDocument] = useState<BookDocument | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<BookPage | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pageAttempt, setPageAttempt] = useState(0);
  const saves = useRef(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const { gameId, kind, language } = request;
  useEffect(() => {
    let active = true;
    void window.hub.openBook({ gameId, kind, language }).then(result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      setDocument(result.value);
      setPageIndex(Math.min(Math.max(0, result.value.lastPage), Math.max(0, result.value.pageCount - 1)));
    }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "This book could not be opened."); setLoading(false); } });
    return () => { active = false; };
  }, [gameId, kind, language, attempt]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    void window.hub.getBookPage({ gameId, kind, language, page: pageIndex }).then(async result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      await Promise.all([result.value.imageUrl, ...result.value.artworkUrls].filter((url): url is string => Boolean(url)).map(decodeImage));
      if (!active) return;
      setPage(result.value); setLoading(false);
      saves.current = saves.current.then(async () => {
        if (!active) return;
        const saved = await window.hub.saveBookProgress({ gameId, kind, language, page: pageIndex });
        if (!saved.ok && active) setSaveError("Your reading position could not be saved.");
      }).catch(() => { if (active) setSaveError("Your reading position could not be saved."); });
    }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "This page could not be opened."); setLoading(false); } });
    return () => { active = false; };
  }, [document, gameId, kind, language, pageIndex, pageAttempt]);

  function goTo(index: number) {
    if (!document || !Number.isFinite(index)) return;
    const next = Math.max(0, Math.min(document.pageCount - 1, Math.floor(index)));
    if (next === pageIndex) return;
    setLoading(true); setPage(null); setError(""); setSaveError(""); setPageIndex(next);
  }
  function retry() {
    setLoading(true); setPage(null); setError(""); setSaveError("");
    if (document) setPageAttempt(value => value + 1); else setAttempt(value => value + 1);
  }
  return { document, page, pageIndex, loading, error, saveError, goTo, retry };
}
