import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseVdf, librariesFromVdf, installFromManifest, type VdfNode } from "../../electron/main/steam/library";

const vdf = readFileSync(new URL("./fixtures/libraryfolders.vdf", import.meta.url), "utf8");
const acf = readFileSync(new URL("./fixtures/appmanifest_2131650.acf", import.meta.url), "utf8");

describe("steam library", () => {
  it("parses nested vdf", () => {
    const node = parseVdf(vdf);
    const lib0 = (node.libraryfolders as VdfNode)["0"] as VdfNode;
    expect(lib0.path).toBe("C:\\Program Files (x86)\\Steam");
  });
  it("lists library paths", () => {
    expect(librariesFromVdf(vdf)).toEqual(["C:\\Program Files (x86)\\Steam", "D:\\SteamLibrary"]);
  });
  it("reads installdir and buildid from an appmanifest", () => {
    expect(installFromManifest(acf)).toEqual({ installdir: "MGS3", buildid: "19964002" });
  });
});
