import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";

const IDLE_MS = 2500;

/** Idle controls float over the book; revealing them never changes the page layout. */
export function useBookControls(busy: boolean) {
  const [awake, setAwake] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pinned = busy || hovered || focused;
  const reveal = useCallback(() => {
    setAwake(true);
    clearTimeout(timer.current);
    if (!pinned) timer.current = setTimeout(() => setAwake(false), IDLE_MS);
  }, [pinned]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!pinned) timer.current = setTimeout(() => setAwake(false), IDLE_MS);
    return () => clearTimeout(timer.current);
  }, [pinned]);
  useEffect(() => {
    window.addEventListener("keydown", reveal, true);
    return () => window.removeEventListener("keydown", reveal, true);
  }, [reveal]);
  return {
    visible: awake || pinned,
    reveal,
    overlayEvents: {
      onPointerEnter: () => { setHovered(true); reveal(); },
      onPointerLeave: () => { setHovered(false); reveal(); },
      onFocusCapture: () => { setFocused(true); reveal(); },
      onBlurCapture: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); reveal(); }
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        // Pointer clicks should not leave a hidden focus lock after the cursor moves away.
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        button?.blur();
      },
    },
  };
}
