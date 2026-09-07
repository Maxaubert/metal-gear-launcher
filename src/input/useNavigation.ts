import { useEffect, useRef, useState } from "react";
import type { Action } from "./navigationReducer";
import { emptySnapshot, readGamepadActions, type PadSnapshot } from "./gamepad";

export type InputKind = "gamepad" | "keyboard" | "mouse";

const KEY_MAP: Record<string, Action> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "confirm",
  Space: "confirm",
  Escape: "back",
  Backspace: "back",
  PageUp: "prevGame",
  PageDown: "nextGame",
  Tab: "menu",
};

const MAX_PADS = 4;

/**
 * Binds keyboard and gamepad input to navigation actions and calls `onAction`
 * for each one. Also returns mouse-driven helpers for onClick handlers.
 */
export function useNavigation(onAction: (action: Action) => void) {
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  });

  // Which input device drove the most recent action - the footer hints (spec 4.7) show
  // gamepad glyphs only while `lastInputKind === "gamepad"`, keyboard/mouse hints otherwise.
  const [lastInputKind, setLastInputKind] = useState<InputKind>("keyboard");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.code !== "Escape") return;
      const action = KEY_MAP[event.code] ?? KEY_MAP[event.key];
      if (!action) return;
      event.preventDefault();
      setLastInputKind("keyboard");
      onActionRef.current(action);
    };
    window.addEventListener("keydown", handleKeyDown);

    const padSnapshots: PadSnapshot[] = Array.from({ length: MAX_PADS }, () => emptySnapshot());
    let frame = 0;
    const poll = (now: number) => {
      const pads = navigator.getGamepads();
      for (let i = 0; i < MAX_PADS; i++) {
        const pad = pads[i];
        if (!pad) continue;
        const snapshot = padSnapshots[i] ?? emptySnapshot();
        const { actions, next } = readGamepadActions(snapshot, pad, now);
        padSnapshots[i] = next;
        for (const action of actions) {
          setLastInputKind("gamepad");
          onActionRef.current(action);
        }
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(frame);
    };
  }, []);

  const focusByMouse = (item: number) => {
    // `Action` has no direct "focus this index" variant (only relative
    // moves), so a mouse hover cannot be translated into a dispatch here.
    // Kept as a typed no-op so callers can wire onMouseEnter today; the
    // consuming Hub UI will need its own way to set focus directly. Still
    // records the input kind, since hovering is itself evidence of mouse use.
    void item;
    setLastInputKind("mouse");
  };

  const confirmByMouse = () => {
    setLastInputKind("mouse");
    onActionRef.current("confirm");
  };

  return { focusByMouse, confirmByMouse, lastInputKind };
}
