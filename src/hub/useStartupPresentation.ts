import { useEffect, useRef, useState } from "react";

const MINIMUM_SPLASH_MS = 2000;
const EXIT_FADE_MS = 400;
type Phase = "holding" | "exiting" | "hidden";

/** Readiness can extend the opening, but never shorten its two-second introduction. */
export function useStartupPresentation(canReveal: boolean) {
  const [presentation, setPresentation] = useState<{ phase: Phase; sequence: number }>({ phase: "holding", sequence: 0 });
  const startedAt = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (!canReveal && presentation.phase !== "holding") {
    setPresentation(previous => ({ phase: "holding", sequence: previous.sequence + (previous.phase === "hidden" ? 1 : 0) }));
  }

  useEffect(() => { startedAt.current = performance.now(); }, [presentation.sequence]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  useEffect(() => {
    if (!canReveal || presentation.phase === "hidden") return;
    const delay = presentation.phase === "holding"
      ? Math.max(0, MINIMUM_SPLASH_MS - (performance.now() - startedAt.current))
      : reducedMotion ? 0 : EXIT_FADE_MS;
    const timer = window.setTimeout(() => setPresentation(previous => ({ ...previous,
      phase: previous.phase === "holding" && !reducedMotion ? "exiting" : "hidden",
    })), delay);
    return () => window.clearTimeout(timer);
  }, [canReveal, presentation, reducedMotion]);

  // A readiness failure restores the opaque recovery screen in the same render.
  return { visible: !canReveal || presentation.phase !== "hidden", exiting: canReveal && presentation.phase === "exiting" };
}
