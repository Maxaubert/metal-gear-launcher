import { describe, expect, it } from "vitest";
import { readGamepadActions, emptySnapshot, type GamepadLike } from "../../src/input/gamepad";

describe("gamepad", () => {
  const pad = (buttons: number[], axes: number[] = [0, 0]): GamepadLike => ({
    buttons: buttons.map((v) => ({ pressed: v === 1, value: v, touched: false })),
    axes,
  });

  it("emits confirm once per press and repeats dpad after 250 ms", () => {
    let s = emptySnapshot();
    let r = readGamepadActions(s, pad([1]), 0);
    expect(r.actions).toEqual(["confirm"]);
    s = r.next;
    r = readGamepadActions(s, pad([1]), 100);
    expect(r.actions).toEqual([]);
    s = emptySnapshot();
    const down = Array(16).fill(0);
    down[13] = 1;
    r = readGamepadActions(s, pad(down), 0);
    expect(r.actions).toEqual(["down"]);
    s = r.next;
    r = readGamepadActions(s, pad(down), 200);
    expect(r.actions).toEqual([]);
    s = r.next;
    r = readGamepadActions(s, pad(down), 260);
    expect(r.actions).toEqual(["down"]);
  });

  it("maps the left stick with a dead zone", () => {
    expect(readGamepadActions(emptySnapshot(), pad([], [0.9, 0]), 0).actions).toEqual(["right"]);
    expect(readGamepadActions(emptySnapshot(), pad([], [0.3, 0]), 0).actions).toEqual([]);
  });
});
