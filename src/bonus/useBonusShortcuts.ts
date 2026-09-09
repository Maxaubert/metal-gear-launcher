import { useEffect, useRef } from "react";

type Shortcuts = { previous: () => void; next: () => void; rewind: () => void; forward: () => void; repeat: () => void; shuffle: () => void };

/** Extra media controls retain held-button state across playback time updates. */
export function useBonusShortcuts(actions: Shortcuts) {
  const current = useRef(actions);
  useEffect(() => { current.current = actions; });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const names: Record<string, keyof Shortcuts> = { Digit1: "repeat", Digit2: "shuffle", KeyQ: "previous", KeyE: "next", KeyA: "rewind", KeyD: "forward" };
      const name = names[event.code];
      if (name) { event.preventDefault(); event.stopImmediatePropagation(); current.current[name](); }
    };
    window.addEventListener("keydown", key, true);
    let frame = 0;
    const held = new Map<number, boolean>();
    const poll = () => {
      const pad = Array.from(navigator.getGamepads()).find(Boolean);
      for (const button of [2, 3]) {
        const pressed = Boolean(pad?.buttons[button]?.pressed);
        if (pressed && !held.get(button)) current.current[button === 2 ? "repeat" : "shuffle"]();
        held.set(button, pressed);
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => { window.removeEventListener("keydown", key, true); cancelAnimationFrame(frame); };
  }, []);
}
