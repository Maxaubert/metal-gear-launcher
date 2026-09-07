import { describe, expect, it } from "vitest";
import { loadPacks, packSchema } from "../shared/packs";

describe("packs", () => {
  it("loads six valid packs in release order", () => {
    const packs = loadPacks();
    expect(packs.map((p) => p.id)).toEqual(["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]);
  });
  it("every pack has the required art roles and a bgm (numbering is optional - not every pack has a real numeral asset)", () => {
    for (const p of loadPacks()) {
      const roles = new Set(p.assets.map((a) => a.role));
      for (const r of ["mainVisual", "logo", "year", "bgm"]) expect(roles, p.id).toContain(r);
    }
  });
  it("every pack declares its fixed header index label", () => {
    const expected: Record<string, string> = { mg12: "000", mgs1: "001", mgs2: "002", mgs3: "003", mgs4: "004", mgspw: "0PW" };
    for (const p of loadPacks()) expect(p.indexLabel, p.id).toBe(expected[p.id]);
  });
  it("rejects a pack with an unknown role", () => {
    const bad = { ...loadPacks()[0], assets: [{ role: "poster", source: "unity", path: "x", name: "y" }] };
    expect(packSchema.safeParse(bad).success).toBe(false);
  });
  it("every pack has a release year and main visuals declare an edge mode", () => {
    for (const p of loadPacks()) {
      expect(p.releaseYear, p.id).toBeGreaterThan(1986);
      const mv = p.assets.find((a) => a.role === "mainVisual")!;
      expect(["fade", "cut"]).toContain(mv.edge);
    }
  });

  it("labels each game with the mission year the collection's own menus use", () => {
    const MISSION_YEARS: Record<string, string> = {
      mg12: "1995-1999",
      mgs1: "2005",
      mgs2: "2007-2009",
      mgs3: "1964",
      mgs4: "2014",
      mgspw: "1974",
    };
    for (const p of loadPacks()) {
      expect(p.yearLabel, p.id).toBe(MISSION_YEARS[p.id]);
    }
  });
});
