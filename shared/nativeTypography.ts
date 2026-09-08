export type NativeSprite = { x: number; y: number; width: number; height: number };
export type NativeTextMetrics = { kind: "sprites"; width: number; height: number; sprites: Record<string, NativeSprite> };
export type NativeGlyph = NativeSprite & { advance: number; bearingX: number; bearingY: number };
export type NativeFontMetrics = { kind: "font"; width: number; height: number; size: number; glyphs: Record<string, NativeGlyph> };
