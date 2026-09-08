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
      "--left-zone": "62.2vw", "--divider-x": "62.2vw", "--col-x": "63.5vw", "--col-right": "99.4vw",
      "--row-h": "5.555556vh", "--row-gap": "0.925926vh", "--menu-top": "48.6vh", "--header-top": "8vh",
      "--desc-top": "25vh", "--hint-baseline": "96vh",
    });
  });
});
