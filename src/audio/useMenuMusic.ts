import { useEffect, useRef, useState } from "react";
import { musicPlaybackVolume } from "./musicVolume";
import { createMusicOutput, type MusicOutput } from "./musicOutput";

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
function playWhenReady(audio: HTMLAudioElement, url: string, signal: AbortSignal, preview: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const readyEvent = preview ? "canplay" : "canplaythrough";
    let starting = false;
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      audio.removeEventListener(readyEvent, play);
      audio.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    };
    const failed = () => finish(new Error("Could not load menu music. Check the selected audio file or choose another track."));
    const aborted = () => finish(new DOMException("Music changed", "AbortError"));
    const play = () => {
      if (starting) return;
      starting = true;
      void audio.play().then(() => finish(), () => finish(new Error("Could not start menu music. Please retry.")));
    };
    const timer = window.setTimeout(() => finish(new Error("Menu music loading timed out. Please retry.")), 15000);
    audio.addEventListener(readyEvent, play);
    audio.addEventListener("error", failed);
    signal.addEventListener("abort", aborted, { once: true });
    audio.src = url;
    audio.load();
  });
}

type PlaybackState = { url?: string; attempt: number; ready: boolean; error: string };

/** Starts automatically, then fades between games without restarting on menu navigation. */
export function useMenuMusic(bgmUrl: string | undefined, volume: number, attempt = 0, preview = false, suspended = false, normalizationGain = 1): { ready: boolean; error: string } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const outputRef = useRef<MusicOutput | null>(null);
  const playingUrlRef = useRef<string | undefined>(undefined);
  const gainRef = useRef(normalizationGain);
  const volumeRef = useRef(musicPlaybackVolume(volume));
  const previewRef = useRef(preview);
  const suspendedRef = useRef(suspended);
  useEffect(() => { suspendedRef.current = suspended; }, [suspended]);
  const [state, setState] = useState<PlaybackState>({ attempt: -1, ready: false, error: "" });

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    gainRef.current = normalizationGain;
    if (playingUrlRef.current === bgmUrl) outputRef.current?.setNormalization(normalizationGain);
  }, [bgmUrl, normalizationGain]);

  useEffect(() => {
    volumeRef.current = musicPlaybackVolume(volume);
    if (audioRef.current) audioRef.current.volume = volumeRef.current;
  }, [volume]);

  useEffect(() => {
    const audio = new Audio();
    audio.id = "menu-music";
    audio.hidden = true;
    audio.loop = true;
    audio.preload = "auto";
    const output = createMusicOutput(audio);
    outputRef.current = output;
    audioRef.current = audio;
    document.body.append(audio);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.remove();
      output.dispose();
      outputRef.current = null;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current!;
    const controller = new AbortController();
    let cancelled = false;
    let cancelFade = () => {};
    // Song browsing changes the source immediately, without the game-switch fade delay.
    const switching = !previewRef.current && Boolean(audio.getAttribute("src")) && !audio.paused;
    const start = async () => {
      audio.pause();
      playingUrlRef.current = bgmUrl;
      outputRef.current!.setNormalization(gainRef.current);
      if (!bgmUrl) {
        audio.removeAttribute("src");
        audio.load();
        setState({ url: bgmUrl, attempt, ready: true, error: "" });
        return;
      }
      audio.volume = switching ? 0 : volumeRef.current;
      try {
        await outputRef.current!.resume();
        if (cancelled) return;
        const source = new URL(bgmUrl);
        // Chromium can retain a failed media resource even after load(); Retry must
        // request the repaired file again instead of reusing that failed resource.
        // Installed media IDs already include their file revision. Its strict protocol
        // accepts only that opaque ID, so it must not receive retry query parameters.
        if (attempt && source.protocol !== "hub-bonus:") source.searchParams.set("musicAttempt", String(attempt));
        await playWhenReady(audio, source.href, controller.signal, previewRef.current);
        if (cancelled) return;
        if (suspendedRef.current) audio.pause();
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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (suspended) audio.pause();
    else if (state.ready && audio.getAttribute("src")) void outputRef.current!.resume().then(() => {
      if (!suspendedRef.current && audioRef.current === audio) return audio.play();
    }).catch(() => {});
  }, [suspended, state.ready]);

  const current = state.url === bgmUrl && state.attempt === attempt;
  return { ready: current && state.ready, error: current ? state.error : "" };
}
