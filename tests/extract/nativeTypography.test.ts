import { describe, expect, it } from "vitest";
import { nativeTypographyMetrics } from "../../electron/main/extract/nativeTypography";

describe("native typography metadata", () => {
  it("preserves original sprite geometry without embedding texture resources", () => {
    expect(nativeTypographyMetrics({ source: { tex: { texture: { width: 64, height: 32, pixel: "unneeded resource" },
      icon: { label: { left: 2, top: 3, width: 20, height: 10, originX: 4 } } } } })).toEqual({
      kind: "sprites", width: 64, height: 32, sprites: { label: { x: 2, y: 3, width: 20, height: 10 } },
    });
  });
  it("preserves glyph advances and bearings separately from painted dimensions", () => {
    expect(nativeTypographyMetrics({ id: "font", maxHeight: 22, source: [{ width: 64, height: 32 }], code: {
      g: { x: 2, y: 3, w: 12, h: 17, width: 14, a: 1, b: 12, id: 0 },
    } })).toEqual({ kind: "font", width: 64, height: 32, size: 22,
      glyphs: { g: { x: 2, y: 3, width: 12, height: 17, advance: 14, bearingX: 0, bearingY: 12 } } });
  });
  it("rejects multiple pages and glyphs outside the exported atlas", () => {
    const page = { width: 64, height: 32 };
    expect(() => nativeTypographyMetrics({ id: "font", maxHeight: 22, source: [page, page], code: {} })).toThrow();
    expect(() => nativeTypographyMetrics({ id: "font", maxHeight: 22, source: [page], code: {
      A: { x: 60, y: 3, w: 12, h: 17, width: 14, a: 1, b: 12, id: 0 },
    } })).toThrow("exceeds");
  });
});
