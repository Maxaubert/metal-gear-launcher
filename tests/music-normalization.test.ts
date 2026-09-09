import { describe, expect, it } from "vitest";
import { loudnessGain, MUSIC_REFERENCE_LUFS } from "../electron/main/music/normalization";

describe("menu music loudness matching", () => {
  it("matches louder album copies and quieter installed recordings to the MGS3 baseline", () => {
    for (const lufs of [-10.6, -12.4, -24.4, MUSIC_REFERENCE_LUFS]) {
      const gain = loudnessGain(lufs, lufs < -20 ? 0.25 : lufs === MUSIC_REFERENCE_LUFS ? 0.4 : 0.99);
      expect(lufs + 20 * Math.log10(gain)).toBeCloseTo(MUSIC_REFERENCE_LUFS, 5);
    }
    expect(loudnessGain(-10.6, 0.99)).toBeLessThan(0.36);
    expect(loudnessGain(MUSIC_REFERENCE_LUFS, 0.4)).toBe(1);
  });

  it("preserves peak headroom and bounds gain for unusually quiet tracks", () => {
    expect(loudnessGain(-30, 0.9) * 0.9).toBeCloseTo(0.98);
    expect(loudnessGain(-50, 0.01)).toBe(4);
  });

  it.each([[NaN, 1], [-20, NaN], [-Infinity, 1], [-80, 0.1], [-20, 0]])(
    "leaves unmeasurable or silent sources unchanged (%s, %s)", (lufs, peak) => {
      expect(loudnessGain(lufs, peak)).toBe(1);
    },
  );
});
