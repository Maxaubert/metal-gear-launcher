import { describe, expect, it } from "vitest";
import { loadPacks, packSchema } from "../shared/packs";

describe("packs", () => {
  it("loads six valid packs in release order", () => {
    const packs = loadPacks();
    expect(packs.map((p) => p.id)).toEqual(["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]);
  });
  it("every pack has the five required art roles and a bgm", () => {
    for (const p of loadPacks()) {
      const roles = new Set(p.assets.map((a) => a.role));
      for (const r of ["mainVisual", "logo", "numbering", "year", "bgm"]) expect(roles, p.id).toContain(r);
    }
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
});
