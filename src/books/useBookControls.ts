import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";

const IDLE_MS = 2500;

/** Idle controls float over the book; revealing them never changes the page layout. */
export function useBookControls(busy: boolean, forceVisible = false) {
  const [awake, setAwake] = useState(true);
  const [manuallyHidden, setManuallyHidden] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pinned = busy || hovered || focused;
  const visible = forceVisible || !manuallyHidden && (awake || pinned);
  const reveal = useCallback(() => {
    setAwake(true);
    clearTimeout(timer.current);
    if (!pinned) timer.current = setTimeout(() => setAwake(false), IDLE_MS);
  }, [pinned]);
  const hide = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("[data-book-overlay]")) active.blur();
    clearTimeout(timer.current);
    setHovered(false); setFocused(false); setManuallyHidden(true);
  }, []);
  const show = useCallback(() => { setManuallyHidden(false); reveal(); }, [reveal]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!pinned) timer.current = setTimeout(() => setAwake(false), IDLE_MS);
    return () => clearTimeout(timer.current);
  }, [pinned]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLElement && target.isContentEditable;
      if (event.code === "KeyH" && !editable && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) { if (!visible) show(); else hide(); }
      } else reveal();
    };
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  }, [reveal, show, hide, visible]);
  return {
    visible,
    manuallyHidden,
    reveal,
    hide,
    show,
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
