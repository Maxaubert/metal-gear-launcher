import { describe, expect, it } from "vitest";
import { parseCliGame } from "../electron/main/cli";
describe("parseCliGame", () => {
  it("reads both forms and ignores unknown ids", () => {
    expect(parseCliGame(["x.exe", "--game", "mgs3"])).toBe("mgs3");
    expect(parseCliGame(["x.exe", "--game=mgspw"])).toBe("mgspw");
    expect(parseCliGame(["x.exe", "--game=halo"])).toBeNull();
    expect(parseCliGame(["x.exe"])).toBeNull();
  });
});
