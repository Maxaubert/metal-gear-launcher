import { useEffect, useRef, useState } from "react";

const MINIMUM_SPLASH_MS = 4000;
const COMPLETION_HOLD_MS = 250;
const EXIT_FADE_MS = 400;
type Phase = "holding" | "complete" | "exiting" | "hidden";

/** Hold the introduction, then visibly complete the bar before revealing the ready menu. */
export function useStartupPresentation(canReveal: boolean) {
  const [presentation, setPresentation] = useState<{ phase: Phase; sequence: number }>({ phase: "holding", sequence: 0 });
  const startedAt = useRef(0);
  const [elapsedProgress, setElapsedProgress] = useState({ sequence: 0, value: 0 });
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (!canReveal && presentation.phase !== "holding") {
    setPresentation(previous => ({ phase: "holding", sequence: previous.sequence + (previous.phase === "hidden" ? 1 : 0) }));
  }

  useEffect(() => { startedAt.current = performance.now(); }, [presentation.sequence]);

  useEffect(() => {
    if (presentation.phase !== "holding") return;
    const timer = window.setInterval(() => {
      // Reserve the final segment for actual readiness, even when loading takes longer.
      const value = Math.min(90, Math.floor(90 * (performance.now() - startedAt.current)
        / (MINIMUM_SPLASH_MS - COMPLETION_HOLD_MS)));
      setElapsedProgress(previous => previous.sequence === presentation.sequence && previous.value === value
        ? previous : { sequence: presentation.sequence, value });
    }, 50);
    return () => window.clearInterval(timer);
  }, [presentation.phase, presentation.sequence]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  useEffect(() => {
    if (!canReveal || presentation.phase === "hidden") return;
    const delay = presentation.phase === "holding"
      ? Math.max(0, MINIMUM_SPLASH_MS - COMPLETION_HOLD_MS - (performance.now() - startedAt.current))
      : presentation.phase === "complete"
        ? Math.max(COMPLETION_HOLD_MS, MINIMUM_SPLASH_MS - (performance.now() - startedAt.current))
        : reducedMotion ? 0 : EXIT_FADE_MS;
    const timer = window.setTimeout(() => setPresentation(previous => ({ ...previous,
      phase: previous.phase === "holding" ? "complete"
        : previous.phase === "complete" && !reducedMotion ? "exiting" : "hidden",
    })), delay);
    return () => window.clearTimeout(timer);
  }, [canReveal, presentation, reducedMotion]);

  // A readiness failure restores the opaque recovery screen in the same render.
  return {
    visible: !canReveal || presentation.phase !== "hidden",
    exiting: canReveal && presentation.phase === "exiting",
    progress: canReveal && presentation.phase !== "holding" ? 100
      : elapsedProgress.sequence === presentation.sequence ? elapsedProgress.value : 0,
  };
}
