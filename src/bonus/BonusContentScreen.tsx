import { useEffect, useRef, useState } from "react";
import type { BonusLibrary, BonusPresentation } from "@shared/bonus";
import type { BookEntry } from "@shared/books";
import BooksScreen from "../books/BooksScreen";
import type { InputKind } from "../input/useNavigation";
import { ControlHint } from "../screens/FooterHints";
import { playMenuSound } from "../audio/menuSounds";
import { useBonusActions, type BonusActionRef } from "./bonusMedia";
import { BonusBackdrop, BonusHeader } from "./BonusScene";
import SoundtrackScreen from "./SoundtrackScreen";
import BonusVideos from "./BonusVideos";
import "./bonus.css";

export type BonusContentScreenProps = { actionRef: BonusActionRef; lastInputKind: InputKind; onClose: () => void; volume: number;
  booksCatalog?: BookEntry[]; onRefreshBooks?: () => Promise<void>;
  onUnavailable?: (title: string, message: string) => void;
  presentation?: BonusPresentation; onPlaybackViewChange?: (open: boolean) => void };

const emptyLibrary: BonusLibrary = { volumes: [], tracks: [], videos: [], artwork: {}, warnings: [] };

export default function BonusContentScreen(props: BonusContentScreenProps) {
  const [library, setLibrary] = useState<BonusLibrary>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [screen, setScreen] = useState<"home" | "music" | "videos" | "books">("home");
  useEffect(() => {
    let active = true;
    window.hub.getBonusContent().then(result => {
      if (!active) return;
      if (result.ok) setLibrary(result.value); else setError(result.error);
      setLoading(false);
    }).catch(reason => { if (active) { setError(String(reason)); setLoading(false); } });
    return () => { active = false; };
  }, [attempt]);
  function retry() { setError(""); setLoading(true); setAttempt(value => value + 1); void props.onRefreshBooks?.(); }
  const back = () => setScreen("home");
  if (screen === "books") return <BooksScreen catalog={props.booksCatalog ?? []} actionRef={props.actionRef} lastInputKind={props.lastInputKind} onClose={back} />;
  if (screen === "music" && library) return <SoundtrackScreen {...props} library={library} onClose={back} />;
  if (screen === "videos") return <BonusVideos {...props} library={library ?? emptyLibrary} onClose={back} />;
  return <BonusHome {...props} library={library} loading={loading} error={error} retry={retry} open={setScreen} />;
}

function BonusHome({ actionRef, lastInputKind, onClose, library, loading, error, retry, open, presentation, booksCatalog, onUnavailable }: BonusContentScreenProps & {
  library?: BonusLibrary; loading: boolean; error: string; retry: () => void; open: (screen: "music" | "videos" | "books") => void;
}) {
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(0);
  const menu = useRef<HTMLDivElement>(null);
  const artVolume = library?.volumes.find(item => item.installed && library.artwork[`${item.id}.mainVisual`])?.id
    ?? presentation?.volume ?? library?.volumes.find(item => item.installed)?.id ?? "none";
  const artwork = library ? {
    ...(artVolume === presentation?.volume ? presentation.artwork : {}),
    ...Object.fromEntries(Object.entries(library.artwork)
      .filter(([key]) => key.startsWith(`${artVolume}.`)).map(([key, value]) => [key.slice(artVolume.length + 1), value])),
  } : presentation?.artwork;
  const hasMusic = !!library?.tracks.length; const hasBooks = !!booksCatalog?.length;
  const libraryReady = !loading && !error && !!library;
  const openMedia = (screen: "videos" | "music", title: string) => {
    if (loading) return;
    if (!libraryReady) { onUnavailable?.(title, "The bonus library could not be read. Choose Retry to try again."); return; }
    if (screen === "videos" || hasMusic) open(screen);
    else onUnavailable?.(title, "The digital soundtrack is not installed. Install Bonus Content through Steam to listen to it.");
  };
  const rows: { title: string; action: () => void; unavailable?: boolean; busy?: boolean }[] = [{ title: "Game Selection", action: onClose },
    { title: "Videos", action: () => openMedia("videos", "Videos"), busy: loading },
    { title: "Digital Soundtrack", unavailable: libraryReady && !hasMusic, busy: loading, action: () => openMedia("music", "Digital Soundtrack") },
    { title: "Books", unavailable: !hasBooks, action: () => hasBooks ? open("books")
      : onUnavailable?.("Books", "No books are installed. Install a supported game through Steam to read its books.") },
    ...(!loading && (error || !library?.tracks.length && !library?.videos.length) ? [{ title: "Retry", action: retry }] : [])];
  const move = (index: number) => { if (focusRef.current !== index) { void playMenuSound("navigate"); focusRef.current = index; setFocus(index); } };
  const activate = (index: number) => {
    const row = rows[index]; if (!row || row.busy) return;
    menu.current?.querySelectorAll<HTMLButtonElement>(":scope > button")[index]?.focus({ preventScroll: true });
    void playMenuSound(index === 0 ? "back" : "select"); row.action();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.code === "KeyR" && !loading && (error || library?.warnings.length)) { event.preventDefault(); retry(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [loading, error, library, retry]);
  useBonusActions(actionRef, action => {
    if (action === "back") activate(0);
    else if (action === "up" || action === "down") move((focusRef.current + (action === "up" ? -1 : 1) + rows.length) % rows.length);
    else if (action === "confirm") activate(Math.min(focusRef.current, rows.length - 1));
  });
  return <main className="bonus-screen bonus-home" aria-label="Bonus Content" data-testid="bonus-content" data-art-volume={artVolume}>
    <BonusBackdrop artwork={artwork} />
    <BonusHeader artwork={artwork} />
    <div className="bonus-home-menu" aria-label="Bonus Content" ref={menu}>
      {rows.map((row, index) => <button key={row.title} data-testid={index === 0 ? "bonus-back" : row.title === "Videos" ? "bonus-menu-videos" : row.title === "Digital Soundtrack" ? "bonus-menu-soundtrack" : row.title === "Books" ? "bonus-menu-books" : "bonus-retry"}
        className={[focus === index ? "bonus-selected" : "", row.unavailable ? "bonus-unavailable" : ""].filter(Boolean).join(" ")}
        aria-disabled={row.unavailable || row.busy || undefined} aria-busy={row.busy || undefined}
        onPointerMove={() => move(index)} onFocus={() => move(index)} onClick={() => activate(index)}><span>{row.title}</span>
        {row.unavailable && <span className="bonus-availability">Not installed</span>}
        {row.busy && <span className="bonus-availability">Loading...</span>}</button>)}
      {loading && <p role="status">Loading bonus content...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !library?.tracks.length && !library?.videos.length && <p>For videos and soundtrack, install Bonus Content through Steam, then choose Retry.</p>}
      {library?.warnings.length ? <p className="bonus-warning">{library.warnings.join(" ")} <button className="bonus-refresh" disabled={loading} onClick={retry}>Refresh Library (R)</button></p> : null}
    </div>
    <BonusHints lastInputKind={lastInputKind} onBack={() => activate(0)} />
  </main>;
}

export function BonusHints({ lastInputKind, onBack }: { lastInputKind: InputKind; onBack: () => void }) {
  return <footer className="bonus-hints"><ControlHint lastInputKind={lastInputKind} keyboard={["↑", "↓"]} gamepad="L" label="Move cursor" />
    <ControlHint lastInputKind={lastInputKind} keyboard="Enter" gamepad="A" label="Confirm" />
    <button className="bonus-hint-button" onClick={onBack} aria-label="Back"><ControlHint lastInputKind={lastInputKind} keyboard="Esc" gamepad="B" label="Back" /></button></footer>;
}
