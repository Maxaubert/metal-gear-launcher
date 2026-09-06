import { useEffect, useRef } from "react";

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

/**
 * Owns the single `HTMLAudioElement` that plays a game's menu music. Call it with the
 * current game's `bgm` asset URL and the configured volume (0..1); it fades out, swaps
 * the source and fades back in whenever `bgmUrl` changes. Browsers block autoplay before
 * a user gesture, so playback stays silent until `unlock()` is called (the hub calls it
 * from the first navigation action).
 */
export function useMenuMusic(bgmUrl: string | undefined, volume: number): { unlock: () => void } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const volumeRef = useRef(volume);
  const cancelFadeRef = useRef<() => void>(() => {});
  const urlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // The audio element is a genuinely imperative, mutable object (HTMLMediaElement), so it
  // is created and torn down in an effect rather than held in state or read during render.
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    return () => {
      cancelFadeRef.current();
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || urlRef.current === bgmUrl) return;
    cancelFadeRef.current();

    const swapAndFadeIn = () => {
      urlRef.current = bgmUrl;
      if (!bgmUrl) return;
      audio.src = bgmUrl;
      if (unlockedRef.current) {
        audio.play().catch(() => {
          // Autoplay can still be refused right after a src change; unlock() retries it.
        });
        cancelFadeRef.current = fade(audio, 0, volumeRef.current);
      }
    };

    if (urlRef.current === undefined || audio.paused) {
      swapAndFadeIn();
    } else {
      cancelFadeRef.current = fade(audio, audio.volume, 0, swapAndFadeIn);
    }
  }, [bgmUrl]);

  const unlock = () => {
    if (unlockedRef.current) return;
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    unlockedRef.current = true;
    audio.play().catch(() => {
      // Still refused (e.g. no gesture reached the OS yet) - the next unlock() call retries.
      unlockedRef.current = false;
    });
    cancelFadeRef.current = fade(audio, 0, volumeRef.current);
  };

  return { unlock };
}
