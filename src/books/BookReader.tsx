import { useEffect, useRef, useState } from "react";
import type { BookRequest } from "@shared/books";
import type { BooksScreenProps } from "./BooksScreen";
import { useBonusActions } from "../bonus/bonusMedia";
import { ControlHint } from "../screens/FooterHints";
import { playMenuSound } from "../audio/menuSounds";
import { useBookReader } from "./useBookReader";
import BookViewport from "./BookViewport";
import { useBookControls } from "./useBookControls";

export default function BookReader({ request, actionRef, lastInputKind, onClose }: Omit<BooksScreenProps, "catalog"> & { request: BookRequest }) {
  const reader = useBookReader(request);
  const [zoom, setZoom] = useState(1);
  const [contents, setContents] = useState(false);
  const [contentFocus, setContentFocus] = useState(0);
  const [pageInput, setPageInput] = useState<string | null>(null);
  const controls = useBookControls(contents || reader.loading || Boolean(reader.error) || Boolean(reader.saveError));
  const viewport = useRef<HTMLDivElement>(null);
  const contentsList = useRef<HTMLDivElement>(null);
  const document = reader.document;
  function changePage(index: number) {
    if (!document || index < 0 || index >= document.pageCount || index === reader.pageIndex) return;
    void playMenuSound("navigate"); reader.goTo(index); setPageInput(null); setContents(false);
  }
  function changeZoom(amount: number) { setZoom(value => Math.round(Math.min(3, Math.max(1, value + amount)) * 100) / 100); }
  function back() { void playMenuSound("back"); if (contents) setContents(false); else onClose(); }
  function toggleContents() {
    if (!document?.contents.length) return;
    void playMenuSound("select");
    const closest = document.contents.reduce((found, entry, index) => entry.page <= reader.pageIndex ? index : found, -1);
    setContentFocus(Math.max(0, closest)); setContents(value => !value);
  }
  function jump() {
    const value = Number(pageInput);
    if (Number.isInteger(value) && value >= 1 && value <= (document?.pageCount ?? 0)) changePage(value - 1);
    setPageInput(null);
  }
  const current = useRef({ changeZoom, changePage, back, toggleContents });
  useEffect(() => { current.current = { changeZoom, changePage, back, toggleContents }; });
  useEffect(() => { contentsList.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [contents, contentFocus]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const actions: Record<string, () => void> = { Equal: () => current.current.changeZoom(.25), NumpadAdd: () => current.current.changeZoom(.25), Minus: () => current.current.changeZoom(-.25), NumpadSubtract: () => current.current.changeZoom(-.25), Digit0: () => setZoom(1), KeyC: () => current.current.toggleContents() };
      const action = actions[event.code];
      if (action) { event.preventDefault(); event.stopImmediatePropagation(); action(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
  useBonusActions(actionRef, action => {
    controls.reveal();
    if (action === "back") { back(); return; }
    if (contents) {
      const count = document?.contents.length ?? 0;
      if (count && (action === "up" || action === "down")) {
        void playMenuSound("navigate"); setContentFocus(index => (index + count + (action === "up" ? -1 : 1)) % count);
      } else if (action === "confirm" && document?.contents[contentFocus]) {
        changePage(document.contents[contentFocus]!.page); setContents(false);
      } else if (action === "menu") setContents(false);
      return;
    }
    if (action === "prevGame" || action === "nextGame") changePage(reader.pageIndex + (action === "prevGame" ? -1 : 1));
    else if (action === "left" || action === "right") {
      if (zoom > 1) viewport.current?.scrollBy({ left: (action === "left" ? -1 : 1) * Math.max(100, viewport.current.clientWidth * .25) });
      else changePage(reader.pageIndex + (action === "left" ? -1 : 1));
    } else if (action === "up" || action === "down") viewport.current?.scrollBy({ top: (action === "up" ? -1 : 1) * Math.max(100, viewport.current.clientHeight * .25) });
    else if (action === "menu") toggleContents();
    else if (action === "confirm") { if (reader.error) reader.retry(); else setZoom(value => value === 1 ? 1.75 : 1); }
  });
  return <main className="bonus-screen books-screen book-reader" data-testid="book-reader" aria-busy={reader.loading}
    data-controls-visible={controls.visible} onPointerMove={controls.reveal} onPointerDown={controls.reveal} onWheel={controls.reveal}>
    <div className="book-controls-overlay" data-testid="book-controls" data-visible={controls.visible} {...controls.overlayEvents}>
    <header className="book-reader-heading"><h1>{document?.title ?? (request.kind === "master" ? "Master Book" : "Screenplay Book")}<span>{request.language === "en" ? "English" : "日本語"}</span></h1></header>
    <nav className="book-toolbar" aria-label="Book controls">
      <button data-testid="book-contents" disabled={!document?.contents.length} aria-expanded={contents} onClick={toggleContents}>Contents</button>
      <div className="book-page-navigation">
        <button data-testid="book-previous" aria-label="Previous page" disabled={!document || reader.pageIndex === 0} onClick={() => changePage(reader.pageIndex - 1)}>Previous</button>
        <form onSubmit={event => { event.preventDefault(); jump(); }}><label htmlFor="book-page-number">Page</label><input id="book-page-number" aria-label="Page number" type="number" min="1" max={document?.pageCount ?? 1}
          value={pageInput ?? reader.pageIndex + 1} disabled={!document} onChange={event => setPageInput(event.target.value)} onBlur={jump} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); } }} />
          <span>/ {document?.pageCount ?? "…"}</span></form>
        <button data-testid="book-next" aria-label="Next page" disabled={!document || reader.pageIndex >= document.pageCount - 1} onClick={() => changePage(reader.pageIndex + 1)}>Next</button>
      </div>
      <div className="book-zoom-controls"><button data-testid="book-zoom-out" aria-label="Zoom out" disabled={zoom === 1} onClick={() => changeZoom(-.25)}>−</button><span aria-live="polite">{Math.round(zoom * 100)}%</span><button data-testid="book-zoom-in" aria-label="Zoom in" disabled={zoom === 3} onClick={() => changeZoom(.25)}>+</button><button data-testid="book-fit" onClick={() => setZoom(1)}>Fit</button></div>
    </nav>
    </div>
    <section className="book-content-area">
      {reader.page && !reader.loading && <BookViewport page={reader.page} zoom={zoom} language={request.language} viewport={viewport} />}
      {reader.loading && <div className="book-status" role="status"><h2>{document ? "Loading page…" : "Opening book…"}</h2><p>Loading the original page.</p><div className="book-loading-line" /></div>}
      {reader.error && <div className="book-status" role="alert"><h2>This book could not be opened</h2><p>{reader.error}</p><button data-testid="book-retry" onClick={reader.retry}>Try Again</button></div>}
      {reader.saveError && <p className="book-save-error" role="status">{reader.saveError} Reopen the book to try again.</p>}
      {contents && <section className="book-contents-panel" aria-label="Contents"><header><h2>Contents</h2><button onClick={() => setContents(false)}>Close</button></header>
        <div className="book-contents-list" ref={contentsList}>{document?.contents.map((entry, index) => <button key={`${entry.page}-${index}`} aria-current={index === contentFocus ? "true" : undefined}
          onPointerMove={() => setContentFocus(index)} onFocus={() => setContentFocus(index)} onClick={() => { changePage(entry.page); setContents(false); }}><span>{entry.title}</span><span>{entry.page + 1}</span></button>)}</div>
      </section>}
    </section>
    <footer className="bonus-player-hints books-footer book-controls-footer" data-visible={controls.visible} {...controls.overlayEvents}>
      <ControlHint lastInputKind={lastInputKind} keyboard={["PgUp", "PgDn"]} gamepad="LB RB" label="Turn page" />
      <ControlHint lastInputKind={lastInputKind} keyboard={["↑", "↓", "←", "→"]} gamepad="L" label={zoom > 1 ? "Pan" : "Navigate"} />
      <ControlHint lastInputKind={lastInputKind} keyboard="Enter" gamepad="A" label="Zoom / Fit" />
      <ControlHint lastInputKind={lastInputKind} keyboard="C" gamepad="Start" label="Contents" />
      <button data-testid="book-back" className="bonus-hint-button" onClick={back}><ControlHint lastInputKind={lastInputKind} keyboard="Esc" gamepad="B" label="Back" /></button>
    </footer>
  </main>;
}
