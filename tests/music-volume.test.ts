import { describe, expect, it } from "vitest";
import { musicPlaybackVolume } from "../src/audio/musicVolume";

describe("background music output volume", () => {
  it.each([[0.6, 0.825], [0.4, 0.55], [0, 0], [0.9, 1], [1, 1], [-1, 0], [99, 1], [NaN, 0], [Infinity, 0]])(
    "safely maps saved volume %s to playback volume %s", (saved, playback) => {
      expect(musicPlaybackVolume(saved)).toBeCloseTo(playback);
    },
  );
});
