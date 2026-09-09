import { useEffect, useRef, useState } from "react";
import type { BookEntry, BookLanguage, BookRequest } from "@shared/books";
import type { InputKind } from "../input/useNavigation";
import { useBonusActions, type BonusActionRef } from "../bonus/bonusMedia";
import { ControlHint } from "../screens/FooterHints";
import { playMenuSound } from "../audio/menuSounds";
import BookReader from "./BookReader";
import UnavailableDialog from "../screens/UnavailableDialog";
import "./books.css";

export type BooksScreenProps = { catalog: BookEntry[]; actionRef: BonusActionRef; lastInputKind: InputKind; onClose: () => void; onRefresh?: () => Promise<void> };

export default function BooksScreen(props: BooksScreenProps) {
  const [request, setRequest] = useState<BookRequest | null>(null);
  const [remembered, setRemembered] = useState<BookRequest | null>(null);
  const [localCatalog, setLocalCatalog] = useState<{ source: BookEntry[]; entries: BookEntry[] } | null>(null);
  const catalog = localCatalog?.source === props.catalog ? localCatalog.entries : props.catalog;
  return request ? <BookReader key={`${request.importedId ?? request.gameId}-${request.kind}-${request.language}`} {...props} request={request} onClose={() => setRequest(null)} />
    : <BookLibrary {...props} catalog={catalog} onCatalog={entries => setLocalCatalog({ source: props.catalog, entries })} remembered={remembered} onOpen={next => { setRemembered(next); setRequest(next); }} />;
}

function BookLibrary({ catalog, actionRef, lastInputKind, onClose, onOpen, remembered, onCatalog, onRefresh }: BooksScreenProps & { onCatalog: (catalog: BookEntry[]) => void; onOpen: (request: BookRequest) => void; remembered: BookRequest | null }) {
  const [focus, setFocus] = useState(Math.max(0, catalog.findIndex(entry => remembered?.importedId ? entry.importedId === remembered.importedId : !entry.importedId && entry.gameId === remembered?.gameId && entry.kind === remembered.kind)));
  const [language, setLanguage] = useState<BookLanguage>(remembered?.language ?? "en");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [toolsFocus, setToolsFocus] = useState<number | null>(null);
  const tools = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = catalog[focus];
  const selectedLanguage = selected?.languages.includes(language) ? language : selected?.languages[0] ?? "en";
  function select(index: number) {
    setToolsFocus(null);
    if (!catalog.length) return;
    const next = (index + catalog.length) % catalog.length;
    if (next !== focus) { void playMenuSound("navigate"); setFocus(next); }
  }
  function open(entry = selected) {
    if (!entry || busy) return;
    if (entry.available === false) { setMessage("This book file is unavailable. Reconnect its drive or restore the file, then choose Refresh."); return; }
    void playMenuSound("select");
    onOpen({ gameId: entry.gameId, kind: entry.kind, importedId: entry.importedId, language: entry.languages.includes(language) ? language : entry.languages[0]! });
  }
  async function update(action: "files" | "folder" | "refresh" | "remove") {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const result = action === "refresh" ? await window.hub.getBooksCatalog()
        : action === "remove" && selected?.importedId ? await window.hub.removeImportedBook(selected.importedId)
        : await window.hub.importBooks(action as "files" | "folder");
      if (!result.ok) { setMessage(result.error); return; }
      onCatalog(result.value); setFocus(value => Math.min(value, Math.max(0, result.value.length - 1)));
      setNotice(action === "remove" ? "Removed from the library. The original file is unchanged." : action === "refresh" ? "Library refreshed." : "Library updated. Your original files stay in their folders.");
      void onRefresh?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The book library could not be updated. Try again."); }
    finally { setBusy(false); }
  }
  function changeLanguage(next: BookLanguage) {
    if (selected?.languages.includes(next) && language !== next) { setLanguage(next); void playMenuSound("navigate"); }
  }
  function back() { void playMenuSound("back"); onClose(); }
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [focus]);
  useBonusActions(actionRef, action => {
    if (message) { if (action === "back" || action === "confirm") setMessage(""); return; }
    if (busy) return;
    if (action === "menu") { if (toolsFocus === null) tools.current?.querySelector<HTMLButtonElement>("button")?.focus(); else { setToolsFocus(null); list.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus(); } return; }
    if (toolsFocus !== null && ["up", "down", "left", "right", "confirm"].includes(action)) {
      const buttons = [...(tools.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (action === "confirm") buttons[toolsFocus]?.click();
      else buttons[(toolsFocus + (action === "up" || action === "left" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      return;
    }
    if (action === "back") back();
    else if (action === "up" || action === "down") select(focus + (action === "up" ? -1 : 1));
    else if (action === "left" || action === "right") changeLanguage(selectedLanguage === "en" ? "jp" : "en");
    else if (action === "confirm") open();
  });
  return <main className="bonus-screen books-screen books-library" data-testid="books-screen" onFocusCapture={event => {
    if (event.target instanceof HTMLElement && !event.target.closest(".books-import-toolbar")) setToolsFocus(null);
  }} onKeyDown={event => {
    if (event.key === "Tab") event.stopPropagation();
    if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLButtonElement) {
      event.stopPropagation();
      if (event.target.classList.contains("books-row")) { event.preventDefault(); if (!event.repeat) open(); }
    }
  }}>
    <header className="bonus-strip-heading"><h1>Books</h1></header>
    <nav className="books-import-toolbar" aria-label="Manage books" ref={tools} aria-busy={busy}>
      {([['files', 'Add Books'], ['folder', 'Add Folder'], ['refresh', 'Refresh']] as const).map(([action, label], index) =>
        <button key={action} disabled={busy} onFocus={() => setToolsFocus(index)} onClick={() => void update(action)}>{label}</button>)}
      <span role="status">{busy ? "Reading library…" : `${catalog.length} books`}</span>
    </nav>
    <section className="books-library-body">
      <div className="books-list-area"><h2>Book List</h2>
        <div className="books-list" ref={list} aria-label="Book List">
          {catalog.map((entry, index) => <button key={entry.importedId ?? `${entry.gameId}-${entry.kind}`} data-testid={`book-entry-${entry.importedId ?? `${entry.gameId}-${entry.kind}`}`} className="books-row" aria-disabled={entry.available === false || undefined} aria-current={index === focus ? "true" : undefined}
            onPointerMove={() => select(index)} onFocus={() => select(index)} onClick={() => open(entry)}>
            <span className="books-row-game">{entry.importedId ? `Personal library · ${entry.format?.toUpperCase() ?? "Book"}` : entry.gameTitle}{entry.available === false ? " · File unavailable" : ""}</span><span className="books-row-title">{entry.title}</span>
          </button>)}
          {!catalog.length && <p className="books-empty">Add your PDF, CBZ or CBR books above, or install a supported Metal Gear game to read its books.</p>}
        </div>
      </div>
      <aside className="books-details">
        <h2>{selected?.title ?? "Books"}</h2>
        {selected && <><p className="books-detail-game">{selected.gameTitle}</p>
          {!selected.importedId && <fieldset><legend>Language</legend><div className="books-language-buttons">
            {(["en", "jp"] as const).map(value => <button key={value} disabled={!selected.languages.includes(value)} aria-pressed={value === selectedLanguage} onClick={() => changeLanguage(value)}>{value === "en" ? "English" : "日本語"}</button>)}
          </div></fieldset>}
          <button className="books-open" onClick={() => open()}>Read Book</button>
          <p className="books-explanation">{selected.importedId ? "Read from your own file. Keep its folder available. Your reading position is saved automatically." : "Prepared from your installed game when first opened. Your reading position is saved automatically."}</p>
          {selected.importedId && <button className="books-remove" disabled={busy} onClick={() => void update("remove")}>Remove from Library</button>}
        </>}
        {notice && <p className="books-explanation" role="status">{notice}</p>}
      </aside>
    </section>
    <footer className="bonus-player-hints books-footer">
      <ControlHint lastInputKind={lastInputKind} keyboard={["↑", "↓"]} gamepad="L" label="Move cursor" />
      <ControlHint lastInputKind={lastInputKind} keyboard="Tab" gamepad="Start" label="Tools" />
      <button className="bonus-hint-button" onClick={() => open()} disabled={!selected}><ControlHint lastInputKind={lastInputKind} keyboard="Enter" gamepad="A" label="Read" /></button>
      <button className="bonus-hint-button" onClick={back}><ControlHint lastInputKind={lastInputKind} keyboard="Esc" gamepad="B" label="Back" /></button>
    </footer>
    {message && <UnavailableDialog title="Books" message={message} onClose={() => setMessage("")} />}
  </main>;
}
