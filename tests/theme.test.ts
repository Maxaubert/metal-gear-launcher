import { describe, expect, it } from "vitest";
import { layoutVars, themeVars } from "../src/theme/theme";
describe("themeVars", () => {
  it("emits css variables including a soft accent", () => {
    expect(themeVars({ accent: "#d81f26", ink: "#111111", paper: "#f4f4ee" })).toEqual({
      "--accent": "#d81f26", "--ink": "#111111", "--paper": "#f4f4ee", "--paper-left": "#f4f4ee",
      "--accent-soft": "rgba(216,31,38,0.18)",
    });
  });

  it("uses paperLeft for --paper-left when a pack sets it", () => {
    expect(themeVars({ accent: "#d81f26", ink: "#111111", paper: "#f4f4ee", paperLeft: "#ecefdd" })).toMatchObject({
      "--paper-left": "#ecefdd",
    });
  });
});
describe("layoutVars", () => {
  it("exposes the normalized layout geometry", () => {
    expect(layoutVars()).toMatchObject({
      "--left-zone": "61vw", "--divider-x": "61.5vw", "--col-x": "63vw", "--col-right": "97.5vw",
      "--row-h": "5.555556vh", "--row-gap": "0.925926vh", "--menu-top": "46vh", "--header-top": "5vh",
      "--desc-top": "22vh", "--hint-baseline": "96vh",
    });
  });
});
