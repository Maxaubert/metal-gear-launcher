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
      if (!bgmUrl) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        return;
      }
      audio.src = bgmUrl;
      if (unlockedRef.current) {
        audio.play().catch(() => {
          // Autoplay can still be refused right after a src change; the next game switch
          // re-enters this same branch and tries again, since `unlockedRef.current` stays true.
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
    // Record the gesture even when `bgmUrl` has not resolved yet: hub state loads
    // asynchronously (see `HubProvider`), and the caller unlocks exactly once, on the very
    // first input, which can arrive before that load finishes and `audio.src` gets set. The
    // effect above reads `unlockedRef.current` in `swapAndFadeIn` and plays as soon as it
    // later sets a src, so recording the gesture here (rather than bailing out) is what makes
    // that catch-up play happen instead of music never starting for the rest of the session.
    unlockedRef.current = true;
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    audio.play().catch(() => {
      // Autoplay can still be refused here; `unlockedRef.current` stays true, so the next
      // `bgmUrl` change (game switch) retries via `swapAndFadeIn` above.
    });
    cancelFadeRef.current = fade(audio, 0, volumeRef.current);
  };

  return { unlock };
}
