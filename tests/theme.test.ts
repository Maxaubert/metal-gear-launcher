import { describe, expect, it } from "vitest";
import { themeVars } from "../src/theme/theme";
describe("themeVars", () => {
  it("emits css variables including a soft accent", () => {
    expect(themeVars({ accent: "#d81f26", ink: "#111111", paper: "#f4f4ee" })).toEqual({
      "--accent": "#d81f26", "--ink": "#111111", "--paper": "#f4f4ee", "--accent-soft": "rgba(216,31,38,0.18)",
    });
  });
});
