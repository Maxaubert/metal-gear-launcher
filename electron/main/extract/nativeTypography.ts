import { z } from "zod";
import type { NativeFontMetrics, NativeTextMetrics } from "../../../shared/nativeTypography";

const positive = z.number().finite().positive();
const coordinate = z.number().finite().nonnegative();
const sprite = z.object({ left: coordinate, top: coordinate, width: positive, height: positive });

/** Retain only the native geometry needed to render the installed text and glyph atlases. */
export function nativeTypographyMetrics(value: unknown): NativeTextMetrics | NativeFontMetrics {
  if ((value as { id?: string })?.id === "font") {
    const font = z.object({ maxHeight: positive, source: z.array(z.object({ width: positive, height: positive })).length(1),
      code: z.record(z.string(), z.object({ x: coordinate, y: coordinate, w: positive, h: positive,
        width: positive, a: z.number().finite(), b: z.number().finite(), id: z.literal(0) })) }).parse(value);
    const source = font.source[0]!;
    return { kind: "font", ...source, size: font.maxHeight, glyphs: Object.fromEntries(Object.entries(font.code).map(([character, glyph]) => {
      if (glyph.x + glyph.w > source.width || glyph.y + glyph.h > source.height) throw new Error("Native glyph exceeds its atlas");
      return [character, { x: glyph.x, y: glyph.y, width: glyph.w, height: glyph.h,
        // PSB a is a vertical ascent adjustment (b - ascent), not a left bearing.
        // Horizontal side bearings are already baked into the glyph bitmap.
        advance: glyph.width, bearingX: 0, bearingY: glyph.b }];
    })) };
  }
  const atlas = z.object({ source: z.object({ tex: z.object({ icon: z.record(z.string(), sprite),
    texture: z.object({ width: positive, height: positive }) }) }) }).parse(value).source.tex;
  return { kind: "sprites", ...atlas.texture, sprites: Object.fromEntries(Object.entries(atlas.icon).map(([id, item]) => {
    if (item.left + item.width > atlas.texture.width || item.top + item.height > atlas.texture.height) throw new Error("Native text exceeds its atlas");
    return [id, { x: item.left, y: item.top, width: item.width, height: item.height }];
  })) };
}
