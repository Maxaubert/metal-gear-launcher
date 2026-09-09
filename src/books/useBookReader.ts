import { useEffect, useRef, useState } from "react";
import type { BookDocument, BookPage, BookRequest } from "@shared/books";
import { PageWindow, type PreparedPage } from "./pageWindow";

function decodeImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const image = new Image();
    const clean = () => { window.clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { clean(); image.src = ""; reject(new Error("Book closed")); };
    const timer = window.setTimeout(() => { clean(); image.src = ""; reject(new Error("A book image took too long to load.")); }, 30000);
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
    void image.decode().then(() => { clean(); resolve(image); }, () => {
      clean(); reject(new Error("A book image could not be loaded."));
    });
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
  const pages = useRef<PageWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const { gameId, kind, language } = request;
  useEffect(() => {
    let active = true;
    const pageCache = new PageWindow(async (index, signal) => {
      const result = await window.hub.getBookPage({ gameId, kind, language, page: index });
      signal.throwIfAborted();
      if (!result.ok) throw new Error(result.error);
      const urls = [...new Set([result.value.imageUrl, ...result.value.artworkUrls].filter((url): url is string => Boolean(url)))];
      const images = await Promise.all(urls.map(url => decodeImage(url, signal)));
      return { page: result.value, images, bytes: images.reduce((bytes, image) => bytes + image.naturalWidth * image.naturalHeight * 4, 0) } satisfies PreparedPage;
    });
    pages.current = pageCache;
    void window.hub.openBook({ gameId, kind, language }).then(result => {
      if (!active) return;
      if (!result.ok) throw new Error(result.error);
      setDocument(result.value);
      setPageIndex(Math.min(Math.max(0, result.value.lastPage), Math.max(0, result.value.pageCount - 1)));
    }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "This book could not be opened."); setLoading(false); } });
    return () => { active = false; pageCache.dispose(); };
  }, [gameId, kind, language, attempt]);

  useEffect(() => {
    if (!document || document.gameId !== gameId || document.kind !== kind || document.language !== language || !pages.current) return;
    let active = true;
    pages.current.focus(pageIndex, document.pageCount);
    void pages.current.get(pageIndex).then(result => {
      if (!active) return;
      setPage(result.page); setLoading(false);
      saves.current = saves.current.then(async () => {
        if (!active) return;
        const saved = await window.hub.saveBookProgress({ gameId, kind, language, page: pageIndex });
        if (!saved.ok && active) setSaveError("Your reading position could not be saved.");
      }).catch(() => { if (active) setSaveError("Your reading position could not be saved."); });
    }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "This page could not be opened."); setLoading(false); } });
    return () => { active = false; };
  }, [document, gameId, kind, language, pageIndex, pageAttempt]);

  function goTo(index: number) {
    if (!document || !Number.isFinite(index) || !pages.current) return;
    const next = Math.max(0, Math.min(document.pageCount - 1, Math.floor(index)));
    if (next === pageIndex) return;
    pages.current.focus(next, document.pageCount);
    const prepared = pages.current.peek(next);
    if (prepared) setPage(prepared);
    setLoading(!prepared); setError(""); setSaveError(""); setPageIndex(next);
  }
  function retry() {
    setLoading(true); setError(""); setSaveError("");
    if (document) { pages.current?.retry(pageIndex, document.pageCount); setPageAttempt(value => value + 1); }
    else setAttempt(value => value + 1);
  }
  return { document, page, pageIndex, loading, error, saveError, goTo, retry };
}
