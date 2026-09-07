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
 * width/height so 1080p and 2160p line up identically. Fixed values, not derived from the
 * pack, so this takes no arguments.
 */
export function layoutVars(gameId?: string): Record<string, string> {
  if (gameId === "mg12" || gameId === "mgs2" || gameId === "mgs3") {
    return {
      "--left-zone": "62.2vw", "--divider-x": "62.2vw",
      "--col-x": "63.5vw", "--col-right": "99.4vw",
      "--header-top": gameId === "mg12" ? "3vh" : "8vh",
      "--desc-top": "25vh", "--menu-top": gameId === "mg12" ? "55vh" : "48.6vh",
      "--row-h": "5.5vh", "--row-gap": "1vh", "--hint-baseline": "96vh",
    };
  }
  return {
    "--left-zone": "61vw",
    "--divider-x": "61.5vw",
    "--col-x": "63vw",
    "--col-right": "97.5vw",
    // Round 8 critique finding 6: with only 3 MVP menu rows (start/gameSelection/quit), the
    // block ended around 58vh, leaving a large empty gap down to the footer hints where the
    // reference's own (longer) menu fills the column. Scaled by ~1.4x per the critique's own
    // estimate rather than inventing extra rows a launcher has no use for.
    "--row-h": "7.84vh",
    "--row-gap": "1.54vh",
    // Round 9 critique finding 1: MGS1's description (the longest real one) was clamping mid-
    // word ("...within the game's...") where it used to render in full. The true 16:9 canvas
    // fixed in round 8 made every `vh`-sized value (including the description's own 2.2vh font)
    // larger in absolute pixels without changing the `vw`-sized column width, so the same text
    // now wraps one line longer than before. Reclaimed 3vh from the menu's own start rather than
    // shrinking the font (menu rows already grew taller this round; starting 3vh later still
    // leaves them well clear of the footer hints, and happens to help the separate "menu block
    // stops too early" finding rather than fight it).
    "--menu-top": "46vh",
    "--header-top": "5vh",
    "--desc-top": "22vh",
    "--hint-baseline": "96vh",
  };
}
