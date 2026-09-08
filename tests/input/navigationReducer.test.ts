import { describe, expect, it } from "vitest";
import { navigate, type NavState } from "../../src/input/navigationReducer";

const base: NavState = { screen: "hub", game: 2, item: 0, menuLength: 3, gameCount: 6 };

describe("navigate", () => {
  it("moves down the menu and wraps", () => {
    expect(navigate({ ...base, item: 2 }, "down").item).toBe(0);
    expect(navigate(base, "up").item).toBe(2);
  });
  it("main-screen horizontal and shoulder inputs preserve the selected game and menu item", () => {
    const current = { ...base, item: 1 };
    for (const action of ["left", "right", "prevGame", "nextGame"] as const) {
      expect(navigate(current, action)).toEqual(current);
    }
  });
  it("menu opens selection, back closes it, confirm on selection picks the focused game", () => {
    const sel = navigate(base, "menu");
    expect(sel.screen).toBe("selection");
    expect(navigate(sel, "back").screen).toBe("hub");
    expect(navigate({ ...sel, item: 4 }, "confirm")).toMatchObject({ screen: "hub", game: 4, item: 0 });
  });
  it("selection up/down step by one tile through the single-column list (regression)", () => {
    const sel = navigate(base, "menu"); // item = game = 2
    expect(navigate(sel, "down").item).toBe(3);
    expect(navigate(sel, "up").item).toBe(1);
    // Every one of the six tiles must be reachable via repeated "down" presses; the old
    // cols=3 wrap made up/down land on only two of the six tiles for a 6-game list.
    let s = { ...sel, item: 0 };
    const visited = new Set<number>();
    for (let i = 0; i < s.gameCount; i++) {
      visited.add(s.item);
      s = navigate(s, "down");
    }
    expect(visited.size).toBe(s.gameCount);
  });
});
