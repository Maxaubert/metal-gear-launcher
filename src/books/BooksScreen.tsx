import { useEffect, useRef, useState } from "react";
import type { BookEntry, BookLanguage, BookRequest } from "@shared/books";
import type { InputKind } from "../input/useNavigation";
import { useBonusActions, type BonusActionRef } from "../bonus/bonusMedia";
import { ControlHint } from "../screens/FooterHints";
import { playMenuSound } from "../audio/menuSounds";
import BookReader from "./BookReader";
import "./books.css";

export type BooksScreenProps = { catalog: BookEntry[]; actionRef: BonusActionRef; lastInputKind: InputKind; onClose: () => void };

export default function BooksScreen(props: BooksScreenProps) {
  const [request, setRequest] = useState<BookRequest | null>(null);
  const [remembered, setRemembered] = useState<BookRequest | null>(null);
  return request ? <BookReader key={`${request.gameId}-${request.kind}-${request.language}`} {...props} request={request} onClose={() => setRequest(null)} />
    : <BookLibrary {...props} remembered={remembered} onOpen={next => { setRemembered(next); setRequest(next); }} />;
}

function BookLibrary({ catalog, actionRef, lastInputKind, onClose, onOpen, remembered }: BooksScreenProps & { onOpen: (request: BookRequest) => void; remembered: BookRequest | null }) {
  const [focus, setFocus] = useState(Math.max(0, catalog.findIndex(entry => entry.gameId === remembered?.gameId && entry.kind === remembered.kind)));
  const [language, setLanguage] = useState<BookLanguage>(remembered?.language ?? "en");
  const list = useRef<HTMLDivElement>(null);
  const selected = catalog[focus];
  const selectedLanguage = selected?.languages.includes(language) ? language : selected?.languages[0] ?? "en";
  function select(index: number) {
    if (!catalog.length) return;
    const next = (index + catalog.length) % catalog.length;
    if (next !== focus) { void playMenuSound("navigate"); setFocus(next); }
  }
  function open(entry = selected) {
    if (!entry) return;
    void playMenuSound("select");
    onOpen({ gameId: entry.gameId, kind: entry.kind, language: entry.languages.includes(language) ? language : entry.languages[0]! });
  }
  function changeLanguage(next: BookLanguage) {
    if (selected?.languages.includes(next) && language !== next) { setLanguage(next); void playMenuSound("navigate"); }
  }
  function back() { void playMenuSound("back"); onClose(); }
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [focus]);
  useBonusActions(actionRef, action => {
    if (action === "back") back();
    else if (action === "up" || action === "down") select(focus + (action === "up" ? -1 : 1));
    else if (action === "left" || action === "right") changeLanguage(selectedLanguage === "en" ? "jp" : "en");
    else if (action === "confirm") open();
  });
  return <main className="bonus-screen books-screen books-library" data-testid="books-screen">
    <header className="bonus-strip-heading"><h1>Books</h1></header>
    <section className="books-library-body">
      <div className="books-list-area"><h2>Book List</h2>
        <div className="books-list" ref={list} aria-label="Book List">
          {catalog.map((entry, index) => <button key={`${entry.gameId}-${entry.kind}`} data-testid={`book-entry-${entry.gameId}-${entry.kind}`} className="books-row" aria-current={index === focus ? "true" : undefined}
            onPointerMove={() => select(index)} onFocus={() => select(index)} onClick={() => open(entry)}>
            <span className="books-row-game">{entry.gameTitle}</span><span className="books-row-title">{entry.title}</span>
          </button>)}
          {!catalog.length && <p className="books-empty">No books found. Install a supported Metal Gear game, then restart the launcher.</p>}
        </div>
      </div>
      <aside className="books-details">
        <h2>{selected?.title ?? "Books"}</h2>
        {selected && <><p className="books-detail-game">{selected.gameTitle}</p>
          <fieldset><legend>Language</legend><div className="books-language-buttons">
            {(["en", "jp"] as const).map(value => <button key={value} disabled={!selected.languages.includes(value)} aria-pressed={value === selectedLanguage} onClick={() => changeLanguage(value)}>{value === "en" ? "English" : "日本語"}</button>)}
          </div></fieldset>
          <button className="books-open" onClick={() => open()}>Read Book</button>
          <p className="books-explanation">Prepared from your installed game when first opened. Your reading position is saved automatically.</p>
        </>}
      </aside>
    </section>
    <footer className="bonus-player-hints books-footer">
      <ControlHint lastInputKind={lastInputKind} keyboard={["↑", "↓"]} gamepad="L" label="Move cursor" />
      <ControlHint lastInputKind={lastInputKind} keyboard={["←", "→"]} gamepad="← →" label="Language" />
      <button className="bonus-hint-button" onClick={() => open()} disabled={!selected}><ControlHint lastInputKind={lastInputKind} keyboard="Enter" gamepad="A" label="Read" /></button>
      <button className="bonus-hint-button" onClick={back}><ControlHint lastInputKind={lastInputKind} keyboard="Esc" gamepad="B" label="Back" /></button>
    </footer>
  </main>;
}
