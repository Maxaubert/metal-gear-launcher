import { describe, expect, it } from "vitest";
import { MENU_THEMES, menuMusicRequest, resolveMenuMusic } from "../shared/menuMusic";

describe("menu music catalog", () => {
  it("offers exactly each game's existing extracted theme", () => {
    for (const [gameId, themes] of Object.entries(MENU_THEMES)) {
      expect(themes).toEqual([{ id: `${gameId}-original`, label: "Original Menu Theme", assetRole: "bgm" }]);
      expect(menuMusicRequest.safeParse({ gameId, themeId: themes[0]!.id }).success).toBe(true);
    }
  });
  it("resolves a selection through the game's assets and handles unavailable audio", () => {
    expect(resolveMenuMusic("mgs2", { bgm: "hub-asset://mgs2/bgm.wav" }, "mgs2-original")).toBe("hub-asset://mgs2/bgm.wav");
    expect(resolveMenuMusic("mgs2", {}, "mgs2-original")).toBeUndefined();
    expect(resolveMenuMusic("mgs2", { bgm: "local" })).toBe("local");
    expect(resolveMenuMusic("mgs2", { bgm: "local" }, "retired-theme")).toBe("local");
  });
  it("rejects unknown games, other games' tracks and renderer-supplied paths", () => {
    for (const request of [
      { gameId: "other", themeId: "mgs2-original" },
      { gameId: "mgs2", themeId: "mgs3-original" },
      { gameId: "mgs2", themeId: "C:/audio.wav" },
      { gameId: "mgs2", themeId: "mgs2-original", path: "C:/audio.wav" },
    ]) expect(menuMusicRequest.safeParse(request).success).toBe(false);
  });
});
