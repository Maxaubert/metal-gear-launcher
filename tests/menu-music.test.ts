import { describe, expect, it } from "vitest";
import { availableMenuThemes, menuMusicRequest, resolveMenuMusic } from "../shared/menuMusic";
import { configSchema } from "../electron/main/config";
import { settingsGameId } from "../shared/settings";

describe("menu music catalog", () => {
  it("never plays extracted original themes for any game, including legacy selections", () => {
    for (const gameId of settingsGameId.options) {
      const assets = { bgm: `hub-asset://${gameId}/bgm.wav` };
      expect(availableMenuThemes(gameId, assets)).toEqual([]);
      expect(resolveMenuMusic(gameId, assets)).toBeUndefined();
      expect(resolveMenuMusic(gameId, assets, `${gameId}-original`)).toBeUndefined();
      expect(resolveMenuMusic(gameId, assets, undefined, { gameId, folderPath: "", defaultThemeId: `${gameId}-original`,
        themes: [{ id: `${gameId}-original`, label: "Original Menu Theme", assetRole: "bgm" }] })).toBeUndefined();
      expect(menuMusicRequest.safeParse({ gameId, themeId: `${gameId}-original` }).success).toBe(false);
    }
  });
  it("reads legacy selections without resetting volume or the recent game", () => {
    const config = { volume: 0.3, lastGame: "mgs4", lastLaunchedGame: "mgs3", menuMusic: { mgs2: "mgs2-original" } };
    expect(configSchema.parse(config)).toEqual(config);
  });
  it("accepts imported file IDs and rejects unknown games, other games' tracks and renderer-supplied paths", () => {
    const themeId = `mgs2-file-${"a".repeat(64)}`;
    expect(menuMusicRequest.safeParse({ gameId: "mgs2", themeId }).success).toBe(true);
    for (const request of [
      { gameId: "other", themeId },
      { gameId: "mgs3", themeId },
      { gameId: "mgs2", themeId: "C:/audio.wav" },
      { gameId: "mgs2", themeId, path: "C:/audio.wav" },
    ]) expect(menuMusicRequest.safeParse(request).success).toBe(false);
  });
});
