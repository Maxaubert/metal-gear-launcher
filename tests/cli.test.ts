import { describe, expect, it } from "vitest";
import { parseCliGame, startGameFor } from "../electron/main/cli";
describe("parseCliGame", () => {
  it("reads both forms and ignores unknown ids", () => {
    expect(parseCliGame(["x.exe", "--game", "mgs3"])).toBe("mgs3");
    expect(parseCliGame(["x.exe", "--game=mgspw"])).toBe("mgspw");
    expect(parseCliGame(["x.exe", "--game=halo"])).toBeNull();
    expect(parseCliGame(["x.exe"])).toBeNull();
  });
});

describe("startGameFor", () => {
  it("starts a first-time user on MGS3", () => {
    expect(startGameFor([], {})).toBe("mgs3");
  });

  it("returns to the most recently launched game instead of a browsed game", () => {
    expect(startGameFor([], { lastLaunchedGame: "mgs4", lastGame: "mg12" })).toBe("mgs4");
  });

  it("honors an explicit game argument over saved history", () => {
    expect(startGameFor(["--game", "mgs2"], { lastLaunchedGame: "mgs4" })).toBe("mgs2");
    expect(startGameFor(["--game=mgspw"], { lastLaunchedGame: "mgs1" })).toBe("mgspw");
  });

  it("retains a valid legacy selection for existing users", () => {
    expect(startGameFor([], { lastGame: "mgs2" })).toBe("mgs2");
  });

  it("ignores invalid arguments and history without falling back to pack order", () => {
    expect(startGameFor(["--game=unknown"], { lastLaunchedGame: "mgs1" })).toBe("mgs1");
    expect(startGameFor([], { lastLaunchedGame: "invalid", lastGame: "mgs2" })).toBe("mgs2");
    expect(startGameFor(["--game=unknown"], { lastLaunchedGame: "invalid", lastGame: "invalid" })).toBe("mgs3");
  });
});
