/** The three colours a pack defines (see `shared/packs/schema.ts`). */
export type ThemeColors = { accent: string; ink: string; paper: string };

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Turns a pack's theme colours into the CSS custom properties `HubProvider`
 * applies to `document.documentElement.style`. `--accent-soft` is the accent
 * at 18% alpha, used for hover/hint backgrounds that shouldn't compete with
 * the solid `.focused` fill.
 */
export function themeVars(theme: ThemeColors): Record<string, string> {
  const { r, g, b } = hexToRgb(theme.accent);
  return {
    "--accent": theme.accent,
    "--ink": theme.ink,
    "--paper": theme.paper,
    "--accent-soft": `rgba(${r},${g},${b},0.18)`,
  };
}
