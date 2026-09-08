/** The colours a pack defines (see `shared/packs/schema.ts`). `paperLeft` is optional. */
export type ThemeColors = { accent: string; ink: string; paper: string; paperLeft?: string };

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
    "--paper-left": theme.paperLeft ?? theme.paper,
    "--accent-soft": `rgba(${r},${g},${b},0.18)`,
  };
}

/**
 * The normalized geometry every game screen shares (spec 4.7): percentages of viewport
 * width/height so 1080p and 2160p line up identically. Only MG/MG2's two chapters need
 * a separate header and menu position.
 */
export function layoutVars(gameId?: string): Record<string, string> {
  // Native launcher rows use a 60px height and 70px pitch on a 1080p canvas.
  const rows = { "--row-h": "5.555556vh", "--row-gap": "0.925926vh" };
  return {
    "--left-zone": "62.2vw", "--divider-x": "62.2vw",
    "--col-x": "63.5vw", "--col-right": "99.4vw",
    "--header-top": gameId === "mg12" ? "3vh" : "8vh",
    "--desc-top": "25vh", "--menu-top": gameId === "mg12" ? "55vh" : "48.6vh",
    ...rows, "--hint-baseline": "96vh",
  };
}
