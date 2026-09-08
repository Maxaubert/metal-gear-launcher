import { useEffect, useRef, useState } from "react";
import type { BonusLibrary } from "@shared/bonus";
import type { BonusContentScreenProps } from "./BonusContentScreen";
import { ControlHint } from "../screens/FooterHints";
import { playMenuSound } from "../audio/menuSounds";
import { mediaTime, numberedTrack, stopMedia, useBonusActions } from "./bonusMedia";
import BonusArtwork from "./BonusArtwork";
import PlayerIcon, { type PlayerIconName } from "./PlayerIcon";
import { useBonusShortcuts } from "./useBonusShortcuts";

export default function SoundtrackScreen({ library, actionRef, lastInputKind, onClose, volume }: BonusContentScreenProps & { library: BonusLibrary }) {
  const [focus, setFocus] = useState(0);
  const focusRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const track = library.tracks[focus];
  function select(index: number) {
    if (!library.tracks.length || index === focusRef.current) return;
    void playMenuSound("navigate");
    focusRef.current = (index + library.tracks.length) % library.tracks.length;
    setFocus(focusRef.current);
    setError(""); setPosition(0); setDuration(0);
  }
  function advance(direction: number) {
    if (shuffle && library.tracks.length > 1) select((focusRef.current + 1 + Math.floor(Math.random() * (library.tracks.length - 1))) % library.tracks.length);
    else select((focusRef.current + direction + library.tracks.length) % library.tracks.length);
  }
  async function play() {
    const element = audio.current;
    if (!element) return;
    setError("");
    try { await element.play(); } catch { if (audio.current === element) { setPlaying(false); setError("This track could not be played. Try Again or choose another track."); } }
  }
  function toggle() { if (audio.current?.paused) void play(); else audio.current?.pause(); }
  function seek(seconds: number) { const element = audio.current; if (element && Number.isFinite(element.duration)) element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds)); }
  function back() { audio.current?.pause(); void playMenuSound("back"); onClose(); }
  useEffect(() => { const element = audio.current; return () => { if (element) stopMedia(element); }; }, [track?.url]);
  useEffect(() => { if (audio.current) audio.current.volume = Math.max(0, Math.min(1, volume)); }, [volume, track?.url]);
  useEffect(() => { list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" }); }, [focus]);
  useBonusActions(actionRef, action => {
    if (action === "back") back();
    else if (action === "up" || action === "down") select((focusRef.current + (action === "up" ? -1 : 1) + library.tracks.length) % library.tracks.length);
    else if (action === "left" || action === "right") seek(action === "left" ? -10 : 10);
    else if (action === "prevGame" || action === "nextGame") advance(action === "prevGame" ? -1 : 1);
    else if (action === "confirm" || action === "menu") toggle();
  });
  useBonusShortcuts({ previous: () => advance(-1), next: () => advance(1), rewind: () => seek(-10), forward: () => seek(10),
    repeat: () => setRepeat(value => !value), shuffle: () => setShuffle(value => !value) });
  const total = duration || track?.duration || 0;
  const title = track ? numberedTrack(track.title, focus) : "No soundtrack installed";
  const controls: { icon: PlayerIconName; title: string; key: string; pad: string; active?: boolean }[] = [
    { icon: "repeat", title: "Repeat", key: "1", pad: "X", active: repeat },
    { icon: "previous", title: "Previous track", key: "Q", pad: "LB" },
    { icon: playing ? "pause" : "play", title: playing ? "Pause" : "Play", key: "Enter", pad: "A" },
    { icon: "next", title: "Next track", key: "E", pad: "RB" },
    { icon: "shuffle", title: "Shuffle", key: "2", pad: "Y", active: shuffle },
  ];
  function activateControl(icon: PlayerIconName) {
    if (icon === "repeat") setRepeat(value => !value);
    else if (icon === "shuffle") setShuffle(value => !value);
    else if (icon === "previous" || icon === "next") advance(icon === "previous" ? -1 : 1);
    else toggle();
  }
  return <main className="bonus-screen bonus-soundtrack" data-testid="bonus-soundtrack-screen">
    <header className="bonus-strip-heading"><h1>Digital Soundtrack</h1></header>
    <div className="bonus-track-area">
      <h2>Music List</h2>
      <div className="bonus-track-list" ref={list} aria-label="Music List">
        {library.tracks.map((item, index) => <button key={item.id} data-testid={`bonus-track-${item.id}`} className="bonus-track-row" aria-current={index === focus ? "true" : undefined}
          onPointerMove={() => select(index)} onFocus={() => select(index)} onClick={() => { if (index === focus) toggle(); else select(index); }}>
          <BonusArtwork src={library.artwork[`thumbnail:${item.id}`] ?? item.artworkUrl} />
          <span>{numberedTrack(item.title, index)}</span>
        </button>)}
      </div>
    </div>
    <div className="bonus-sleeve"><BonusArtwork key={track?.id} src={track?.artworkUrl} alt={track?.title ?? ""} /></div>
    <section className="bonus-audio-player" aria-label="Soundtrack player">
      <p className="bonus-playing-title">{title}</p>
      <input className="bonus-seek" type="range" aria-label="Playback position" min="0" max={total || 1} step="0.1" value={Math.min(position, total || 1)}
        onPointerUp={event => event.currentTarget.blur()}
        onChange={event => { if (audio.current) audio.current.currentTime = Number(event.target.value); }} />
      <div className="bonus-player-times"><span>{mediaTime(position)}</span><span>-{mediaTime(total - position)}</span></div>
      <div className="bonus-player-controls">{controls.map(control => <button key={control.title} aria-label={control.title} aria-pressed={control.active}
        className={control.active === false ? "bonus-control-off" : ""} onClick={() => activateControl(control.icon)}>
        <PlayerIcon name={control.icon} /><ControlHint lastInputKind={lastInputKind} keyboard={control.key} gamepad={control.pad} label="" />
      </button>)}</div>
      {error && <div className="bonus-media-error" role="alert">{error} <button onClick={() => { audio.current?.load(); void play(); }}>Try Again</button></div>}
    </section>
    {track && <audio key={track.url} ref={audio} src={track.url} preload="auto" autoPlay={playing}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
      onError={() => { setPlaying(false); setError("This track could not be played. Try Again or choose another track."); }}
      onEnded={() => { if (repeat) { if (audio.current) audio.current.currentTime = 0; void play(); } else if (library.tracks.length > 1) { setPlaying(true); advance(1); } else setPlaying(false); }} />}
    <footer className="bonus-player-hints"><ControlHint lastInputKind={lastInputKind} keyboard={["↑", "↓"]} gamepad="L" label="Move cursor" />
      <ControlHint lastInputKind={lastInputKind} keyboard="A" gamepad="←" label="Rewind 10 Seconds" />
      <ControlHint lastInputKind={lastInputKind} keyboard="D" gamepad="→" label="Fast Forward 10 Seconds" />
      <button className="bonus-hint-button" onClick={back} aria-label="Back"><ControlHint lastInputKind={lastInputKind} keyboard="Esc" gamepad="B" label="Back" /></button></footer>
  </main>;
}
