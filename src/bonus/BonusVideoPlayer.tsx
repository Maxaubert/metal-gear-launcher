import { useEffect, useRef, useState } from "react";
import type { BonusVideo } from "@shared/bonus";
import type { BonusContentScreenProps } from "./BonusContentScreen";
import { ControlHint } from "../screens/FooterHints";
import { playMenuSound } from "../audio/menuSounds";
import { mediaTime, stopMedia, useBonusActions } from "./bonusMedia";
import PlayerIcon from "./PlayerIcon";

export default function BonusVideoPlayer({ video, startTime, actionRef, onClose, lastInputKind, volume, onPlaybackViewChange }: BonusContentScreenProps & { video: BonusVideo; startTime: number }) {
  useEffect(() => { onPlaybackViewChange?.(true); return () => onPlaybackViewChange?.(false); }, [onPlaybackViewChange]);
  const player = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(startTime);
  const [duration, setDuration] = useState(video.duration);
  const [error, setError] = useState("");
  const [controls, setControls] = useState(true);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  function reveal() { setControls(true); clearTimeout(hide.current); hide.current = setTimeout(() => setControls(false), 3000); }
  async function play() {
    const element = player.current;
    if (!element) return;
    setError("");
    try { await element.play(); } catch { if (element === player.current) { setError("This video could not be played. Try Again or go Back."); setPlaying(false); } }
  }
  function toggle() { reveal(); if (player.current?.paused) void play(); else player.current?.pause(); }
  function seek(delta: number) { reveal(); if (player.current) player.current.currentTime = Math.min(duration, Math.max(0, player.current.currentTime + delta)); }
  function back() { player.current?.pause(); void playMenuSound("back"); onClose(); }
  useEffect(() => { const element = player.current; return () => { clearTimeout(hide.current); if (element) stopMedia(element); }; }, []);
  useEffect(() => { if (player.current) player.current.volume = Math.max(0, Math.min(1, volume)); }, [volume]);
  useBonusActions(actionRef, action => {
    if (action === "back") back();
    else if (action === "confirm" || action === "menu") toggle();
    else if (action === "left" || action === "right") seek(action === "left" ? -10 : 10);
    else if (action === "prevGame" || action === "nextGame") {
      const at = player.current?.currentTime ?? position;
      const chapters = action === "prevGame" ? [...video.chapters].reverse() : video.chapters;
      const target = chapters.find(time => action === "prevGame" ? time < at - 1 : time > at + 1);
      if (target !== undefined && player.current) { player.current.currentTime = target; reveal(); }
    } else reveal();
  });
  return <main className="bonus-screen bonus-video-player" data-testid="bonus-video-player" onPointerMove={reveal}>
    <video ref={player} src={video.url} autoPlay preload="auto" onClick={toggle}
      onLoadedMetadata={event => { const element = event.currentTarget; setDuration(element.duration); element.currentTime = Math.min(startTime, element.duration); reveal(); }}
      onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setControls(true); }} onError={() => { setError("This video could not be played. Try Again or go Back."); setPlaying(false); }} />
    <section className="bonus-video-controls" data-visible={controls || !playing || Boolean(error)} aria-label="Video player">
      <h1>{video.title}</h1>
      <div className="bonus-video-timeline"><time>{mediaTime(position)}</time><input type="range" aria-label="Video position" min="0" max={duration || 1}
        step="1" value={Math.min(position, duration)} onPointerUp={event => event.currentTarget.blur()}
        onChange={event => { reveal(); if (player.current) player.current.currentTime = Number(event.target.value); }} /><time>{mediaTime(duration)}</time></div>
      <div className="bonus-video-actions"><button aria-label={playing ? "Pause" : "Play"} onClick={toggle}><PlayerIcon name={playing ? "pause" : "play"} /></button>
        <button onClick={() => seek(-10)}>Rewind 10 Seconds</button><button onClick={() => seek(10)}>Fast Forward 10 Seconds</button><button data-testid="bonus-back" onClick={back}>Back</button></div>
      {error && <p role="alert">{error} <button onClick={() => { player.current?.load(); void play(); }}>Try Again</button></p>}
      <footer><ControlHint lastInputKind={lastInputKind} keyboard="Enter" gamepad="A" label={playing ? "Pause" : "Play"} />
        <ControlHint lastInputKind={lastInputKind} keyboard={["←", "→"]} gamepad="L" label="Seek 10 Seconds" />
        <ControlHint lastInputKind={lastInputKind} keyboard={["Page Up", "Page Down"]} gamepad="LB RB" label="Chapter" />
        <ControlHint lastInputKind={lastInputKind} keyboard="Esc" gamepad="B" label="Back" /></footer>
    </section>
  </main>;
}
