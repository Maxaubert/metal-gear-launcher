import { useEffect, useRef, useState } from "react";

const FADE_MS = 300;
const FADE_STEP_MS = 25;

function fade(audio: HTMLAudioElement, from: number, to: number, onDone?: () => void): () => void {
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  let step = 0;
  audio.volume = from;
  const id = window.setInterval(() => {
    step += 1;
    audio.volume = from + (to - from) * (step / steps);
    if (step >= steps) {
      window.clearInterval(id);
      audio.volume = to;
      onDone?.();
    }
  }, FADE_STEP_MS);
  return () => window.clearInterval(id);
}

/** Resolves only after buffering and playback start, including when the volume is zero. */
function playWhenReady(audio: HTMLAudioElement, url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let starting = false;
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      audio.removeEventListener("canplaythrough", play);
      audio.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    };
    const failed = () => finish(new Error("Could not load menu music. Please retry or re-extract artwork."));
    const aborted = () => finish(new DOMException("Music changed", "AbortError"));
    const play = () => {
      if (starting) return;
      starting = true;
      void audio.play().then(() => finish(), () => finish(new Error("Could not start menu music. Please retry.")));
    };
    const timer = window.setTimeout(() => finish(new Error("Menu music loading timed out. Please retry.")), 15000);
    audio.addEventListener("canplaythrough", play);
    audio.addEventListener("error", failed);
    signal.addEventListener("abort", aborted, { once: true });
    audio.src = url;
    audio.load();
  });
}

type PlaybackState = { url?: string; attempt: number; ready: boolean; error: string };

/** Starts automatically, then fades between games without restarting on menu navigation. */
export function useMenuMusic(bgmUrl: string | undefined, volume: number, attempt = 0): { ready: boolean; error: string } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(volume);
  const [state, setState] = useState<PlaybackState>({ attempt: -1, ready: false, error: "" });

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = new Audio();
    audio.id = "menu-music";
    audio.hidden = true;
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;
    document.body.append(audio);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.remove();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current!;
    const controller = new AbortController();
    let cancelled = false;
    let cancelFade = () => {};
    const switching = Boolean(audio.getAttribute("src")) && !audio.paused;
    const start = async () => {
      audio.pause();
      if (!bgmUrl) {
        audio.removeAttribute("src");
        audio.load();
        setState({ url: bgmUrl, attempt, ready: true, error: "" });
        return;
      }
      audio.volume = switching ? 0 : volumeRef.current;
      try {
        const source = new URL(bgmUrl);
        // Chromium can retain a failed media resource even after load(); Retry must
        // request the repaired file again instead of reusing that failed resource.
        if (attempt) source.searchParams.set("musicAttempt", String(attempt));
        await playWhenReady(audio, source.href, controller.signal);
        if (cancelled) return;
        if (switching) cancelFade = fade(audio, 0, volumeRef.current, () => { audio.volume = volumeRef.current; });
        setState({ url: bgmUrl, attempt, ready: true, error: "" });
      } catch (error) {
        if (cancelled) return;
        audio.pause();
        setState({ url: bgmUrl, attempt, ready: false, error: error instanceof Error ? error.message : String(error) });
      }
    };
    if (switching) cancelFade = fade(audio, audio.volume, 0, () => { void start(); });
    else void start();
    return () => { cancelled = true; cancelFade(); controller.abort(); };
  }, [bgmUrl, attempt]);

  const current = state.url === bgmUrl && state.attempt === attempt;
  return { ready: current && state.ready, error: current ? state.error : "" };
}
