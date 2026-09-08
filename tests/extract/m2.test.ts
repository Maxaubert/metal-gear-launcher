import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseM2FileTable, spriteRect } from "../../electron/main/extract/m2";

const manifest = JSON.parse(readFileSync(new URL("./fixtures/alldata.psb.m.json", import.meta.url), "utf8"));
const atlas = JSON.parse(readFileSync(new URL("./fixtures/atlas.psb.m.json", import.meta.url), "utf8"));

describe("m2", () => {
  it("maps archive paths to offset and size", () => {
    const table = parseM2FileTable(manifest);
    expect(table.get("system/motion/outgame_menu_main.psb.m")).toEqual({ offset: 123456, size: 81_000_000 });
  });
  it("reads a sprite rect from the atlas json", () => {
    expect(spriteRect(atlas, "tex#000", "0019")).toEqual({ left: 1, top: 1877, width: 1130, height: 1086 });
  });
});
