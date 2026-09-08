import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type { GameState } from "@shared/ipc";
import { achievementIconUrl, type AchievementsSnapshot } from "@shared/achievements";
import type { Action } from "../input/navigationReducer";
import type { InputKind } from "../input/useNavigation";
import FooterHints from "../screens/FooterHints";
import { themeVars } from "../theme/theme";
import { playMenuSound } from "../audio/menuSounds";
import "./trophies.css";

type Props = { game: GameState; lastInputKind: InputKind; onClose: () => void; actionRef: MutableRefObject<((action: Action) => void) | null> };
export function percentLabel(percent: number | null): string {
  if (percent === null) return "Unavailable";
  if (percent > 0 && percent < .1) return "<0.1%";
  return `${percent.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
}
function TrophyIcon({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  const safe = achievementIconUrl(url);
  return safe && !failed ? <img src={safe} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 7h20v13c0 8-5 12-10 12s-10-4-10-12V7ZM14 11H7v6c0 5 3 8 8 8m19-14h7v6c0 5-3 8-8 8M24 32v8m-9 2h18" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}

export default function TrophiesScreen({ game, lastInputKind, onClose, actionRef }: Props) {
  const [snapshot, setSnapshot] = useState<AchievementsSnapshot>();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0), rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const source = snapshot?.sources[sourceIndex];
  const trophies = source?.achievements ?? [];
  const selected = trophies[Math.min(focus, trophies.length - 1)];
  const count = trophies.length + 2;
  const focusRef = useRef(focus); focusRef.current = focus;
  function focusRow(index: number) {
    if (index === focusRef.current) return;
    focusRef.current = index;
    setFocus(index); void playMenuSound("navigate");
  }
  async function read(refresh = false) {
    const attempt = ++generation.current;
    setBusy(true); setError("");
    try {
      const result = await window.hub.getAchievements({ gameId: game.pack.id, refresh });
      if (attempt !== generation.current) return;
      if (!result.ok) { setError(result.error); return; }
      setSnapshot(result.value); setSourceIndex(previous => Math.min(previous, result.value.sources.length - 1)); setFocus(0);
    } catch { if (attempt === generation.current) setError("Could not load trophies. Choose Refresh to try again."); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  useEffect(() => {
    const marker = generation;
    void read();
    return () => { marker.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.pack.id]);
  const close = () => { void playMenuSound("back"); onClose(); };
  function selectSource(index: number) { if (index !== sourceIndex) { setSourceIndex(index); setFocus(0); void playMenuSound("navigate"); } }
  function activate(index: number) {
    if (index === trophies.length) { if (!busy) { void playMenuSound("select"); void read(true); } }
    else if (index === trophies.length + 1) close();
  }
  useEffect(() => {
    actionRef.current = action => {
      if (action === "back" || action === "menu") close();
      else if (action === "up" || action === "down") focusRow((focus + (action === "up" ? count - 1 : 1)) % count);
      else if ((action === "left" || action === "right") && snapshot && snapshot.sources.length > 1) selectSource((sourceIndex + (action === "left" ? snapshot.sources.length - 1 : 1)) % snapshot.sources.length);
      else if (action === "confirm") activate(focus);
    };
    return () => { actionRef.current = null; };
  });
  useEffect(() => { rowRefs.current[focus]?.scrollIntoView({ block: "nearest" }); }, [focus, sourceIndex]);
  const earned = trophies.filter(t => t.unlocked === true).length;
  const known = trophies.filter(t => t.unlocked !== null).length;
  return <section className="screen settings-screen trophies-screen" data-testid="trophies-screen" data-game={game.pack.id} data-detail="true"
    style={{ ...themeVars(game.pack.theme), "--ink": "#080808", "--paper": "#dcdcda" } as CSSProperties} aria-label={`${game.pack.shortTitle} trophies`}>
    <h1 className="settings-heading">Trophies</h1>
    <div className="trophies-toolbar">
      <div className="trophies-sources" aria-label="Achievement platform">
        {(snapshot?.sources ?? []).map((item, index) => <button key={item.id} aria-pressed={index === sourceIndex} onClick={() => selectSource(index)}>{item.label}</button>)}
      </div>
      <p>{trophies.length > 0 ? `${earned} ${known < trophies.length ? "known " : ""}earned / ${trophies.length} trophies` : game.pack.shortTitle}</p>
    </div>
    <div className="trophies-list" role="group" aria-label="Individual trophies" aria-busy={busy}>
      {busy && <p role="status">Loading trophies...</p>}
      {!busy && trophies.map((trophy, index) => <button key={trophy.id} className={`trophy-row ${focus === index ? "focused" : ""}`} ref={el => { rowRefs.current[index] = el; }}
        aria-current={focus === index ? "true" : undefined} onPointerMove={event => { if (event.pointerType !== "touch") focusRow(index); }}
        onFocus={() => focusRow(index)} onClick={() => focusRow(index)}>
        <span className="trophy-icon"><TrophyIcon key={trophy.iconUrl} url={trophy.iconUrl} /></span>
        <span className="trophy-name">{trophy.name}<small>{trophy.unlocked === true ? "Earned" : trophy.unlocked === false ? "Locked" : "Unlock status unavailable"}</small></span>
        <span className="trophy-percent" aria-label={trophy.percent === null ? "Player percentage unavailable" : `${percentLabel(trophy.percent)} of players`}>{percentLabel(trophy.percent)}</span>
      </button>)}
      {!busy && !trophies.length && <p>{source?.message ?? "No trophy data is available for this edition."}</p>}
    </div>
    <aside className="trophy-detail" aria-label="Selected trophy">
      {selected && <>
        <span className="trophy-detail-icon"><TrophyIcon key={selected.iconUrl} url={selected.iconUrl} /></span>
        <h2>{selected.name}</h2><p>{selected.description || "No description supplied by the platform."}</p>
        <p className="trophy-global">{percentLabel(selected.percent)}<small>{selected.percent === null ? "Player percentage unavailable" : `${source?.platform === "gog" ? "GOG" : "Steam"} players earned this trophy`}</small></p>
        <p>{selected.unlocked === true ? "Earned" : selected.unlocked === false ? "Locked" : "Your unlock status is unavailable"}
          {selected.unlocked === true && selected.unlockedAt && <small>{new Date(selected.unlockedAt * 1000).toLocaleDateString()}</small>}</p>
      </>}
    </aside>
    <div className="trophies-actions">
      <button className={focus === trophies.length ? "focused" : ""} disabled={busy} onPointerMove={event => { if (event.pointerType !== "touch") focusRow(trophies.length); }} onFocus={() => focusRow(trophies.length)} onClick={() => activate(trophies.length)}>Refresh</button>
      <button className={focus === trophies.length + 1 ? "focused" : ""} onPointerMove={event => { if (event.pointerType !== "touch") focusRow(trophies.length + 1); }} onFocus={() => focusRow(trophies.length + 1)} onClick={close}>Back</button>
    </div>
    <p className="settings-help" role={error ? "alert" : "status"}>{error || source?.message || (source ? `${source.stale ? "Cached data" : "Checked"} · ${new Date(source.updatedAt).toLocaleString()}` : "Trophies come directly from Steam or GOG Galaxy's local cache.")}</p>
    <FooterHints lastInputKind={lastInputKind} />
  </section>;
}
