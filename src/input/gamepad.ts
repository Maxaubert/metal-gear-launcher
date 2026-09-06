import type { Action } from "./navigationReducer";

const BUTTON_MAP: Record<number, Action> = {
  0: "confirm",
  1: "back",
  4: "prevGame",
  5: "nextGame",
  9: "menu",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

const REPEATABLE = new Set<Action>(["up", "down", "left", "right"]);
const DEAD_ZONE = 0.5;
const INITIAL_REPEAT_MS = 250;
const REPEAT_MS = 120;

type HeldInfo = { start: number; lastRepeat: number };

export type PadSnapshot = { held: Partial<Record<Action, HeldInfo>> };

// A structural subset of the DOM `Gamepad` type. Tests run under a tsconfig
// with no DOM lib, so they cannot reference the ambient `Gamepad` type; a
// real `Gamepad` (from `navigator.getGamepads()`) satisfies this shape.
export type GamepadLike = {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
};

export function emptySnapshot(): PadSnapshot {
  return { held: {} };
}

function stickActions(axes: readonly number[]): Action[] {
  const x = axes[0] ?? 0;
  const y = axes[1] ?? 0;
  const actions: Action[] = [];
  if (x <= -DEAD_ZONE) actions.push("left");
  else if (x >= DEAD_ZONE) actions.push("right");
  if (y <= -DEAD_ZONE) actions.push("up");
  else if (y >= DEAD_ZONE) actions.push("down");
  return actions;
}

export function readGamepadActions(
  prev: PadSnapshot,
  pad: GamepadLike,
  now: number,
): { actions: Action[]; next: PadSnapshot } {
  const pressed = new Set<Action>();

  for (let i = 0; i < pad.buttons.length; i++) {
    const action = BUTTON_MAP[i];
    if (!action) continue;
    if (pad.buttons[i]?.pressed) pressed.add(action);
  }
  for (const action of stickActions(pad.axes)) pressed.add(action);

  const actions: Action[] = [];
  const held: Partial<Record<Action, HeldInfo>> = {};

  for (const action of pressed) {
    const prior = prev.held[action];
    if (!prior) {
      actions.push(action);
      held[action] = { start: now, lastRepeat: now };
      continue;
    }
    if (REPEATABLE.has(action)) {
      const sinceStart = now - prior.start;
      const sinceRepeat = now - prior.lastRepeat;
      if (sinceStart >= INITIAL_REPEAT_MS && sinceRepeat >= REPEAT_MS) {
        actions.push(action);
        held[action] = { start: prior.start, lastRepeat: now };
        continue;
      }
    }
    held[action] = prior;
  }

  return { actions, next: { held } };
}
