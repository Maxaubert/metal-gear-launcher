import { describe, expect, it } from "vitest";
import { levelMenuSound } from "../src/audio/levelMenuSound";

describe("menu effect levels", () => {
  it("raises a quiet cursor tick while preserving its attack, shape and stereo balance", () => {
    const left = new Float32Array([0, 0.05, -0.1, 0.02, 0]);
    const right = new Float32Array([0, 0.025, -0.05, 0.01, 0]);
    levelMenuSound([left, right]);
    expect(left[0]).toBe(0);
    expect(left[1]).toBeCloseTo(0.425);
    expect(left[2]).toBeCloseTo(-0.85);
    expect(left[3]).toBeCloseTo(0.17);
    expect(right[2]).toBeCloseTo(-0.425);
    expect(left[4]).toBe(0);
  });

  it("leaves silence alone and caps gain on extremely quiet recordings", () => {
    const silence = new Float32Array([0, 0.00001, -0.00001]);
    const original = silence.slice();
    levelMenuSound([silence]);
    expect(silence).toEqual(original);
    const quiet = new Float32Array([0.002, -0.003]);
    levelMenuSound([quiet]);
    expect(quiet[0]).toBeCloseTo(0.032);
    expect(quiet[1]).toBeCloseTo(-0.048);
  });

  it("keeps loud input below the peak ceiling instead of applying a blind boost", () => {
    const loud = new Float32Array([1, -1, 0.5]);
    levelMenuSound([loud]);
    expect(loud[0]).toBeCloseTo(0.85);
    expect(loud[1]).toBeCloseTo(-0.85);
    expect(loud[2]).toBeCloseTo(0.425);
  });
});
