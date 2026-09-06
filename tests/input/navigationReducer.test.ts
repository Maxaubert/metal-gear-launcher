import { describe, expect, it } from "vitest";
import { navigate, type NavState } from "../../src/input/navigationReducer";

const base: NavState = { screen: "hub", game: 2, item: 0, menuLength: 3, gameCount: 6 };

describe("navigate", () => {
  it("moves down the menu and wraps", () => {
    expect(navigate({ ...base, item: 2 }, "down").item).toBe(0);
    expect(navigate(base, "up").item).toBe(2);
  });
  it("left/right and prev/next change game and reset item", () => {
    expect(navigate({ ...base, item: 1 }, "right")).toMatchObject({ game: 3, item: 0 });
    expect(navigate({ ...base, game: 0 }, "prevGame").game).toBe(5);
  });
  it("menu opens selection, back closes it, confirm on selection picks the focused game", () => {
    const sel = navigate(base, "menu");
    expect(sel.screen).toBe("selection");
    expect(navigate(sel, "back").screen).toBe("hub");
    expect(navigate({ ...sel, item: 4 }, "confirm")).toMatchObject({ screen: "hub", game: 4, item: 0 });
  });
});
