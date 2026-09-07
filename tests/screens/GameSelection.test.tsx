import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GameSelection from "../../src/screens/GameSelection";
import { loadPacks } from "@shared/packs";
import type { GameState } from "@shared/ipc";

/** mgs1 (index 1) is the not-installed fixture game; every other game is installed. One
 * installed game (mg12) also carries no cached cover art yet, to prove the not-installed
 * signal doesn't depend on `assetUrls.mainVisual` existing. */
function makeGames(): GameState[] {
  return loadPacks().map((pack, i) => ({
    pack,
    installed: i !== 1,
    assetUrls: i === 0 || i === 1 ? {} : { mainVisual: `hub-asset://${pack.id}/mainVisual.png` },
    stale: false,
  }));
}

describe("GameSelection - not-installed tiles", () => {
  it("marks only the not-installed game's tile so the grid still shows which games need install", () => {
    const games = makeGames();
    const html = renderToStaticMarkup(<GameSelection games={games} focusIndex={0} onSelect={() => {}} />);

    expect(html).toContain('data-testid="tile-mgs1"');
    const mgs1Tile = html.slice(html.indexOf('data-testid="tile-mgs1"'), html.indexOf('data-testid="tile-mgs1"') + 200);
    expect(mgs1Tile).toMatch(/class="tile[^"]*\bnot-installed\b/);

    for (const g of games) {
      if (g.pack.id === "mgs1") continue;
      const start = html.indexOf(`data-testid="tile-${g.pack.id}"`);
      const chunk = html.slice(start, start + 200);
      expect(chunk, `tile-${g.pack.id} should not be marked not-installed`).not.toMatch(/\bnot-installed\b/);
    }
  });

  it("still renders the not-installed tile's title/number text at full markup weight (no dimming on the text itself)", () => {
    const games = makeGames();
    const html = renderToStaticMarkup(<GameSelection games={games} focusIndex={0} onSelect={() => {}} />);

    // The dimming lives entirely in global.css's `.tile.not-installed .tile-cover` rule -
    // confirm the title/number spans carry no inline opacity styling of their own, so the
    // contrast floor comment in GameSelection/global.css stays true even without a stylesheet.
    expect(html).toContain('<span class="tile-title">MGS1</span>');
    expect(html).toMatch(/<span class="tile-number" style="[^"]*">1<\/span>/);
  });

  it("does not mark an installed game's tile, with or without cached cover art", () => {
    const games = makeGames();
    const html = renderToStaticMarkup(<GameSelection games={games} focusIndex={0} onSelect={() => {}} />);

    // mg12 (index 0) is installed but has no cached art yet - must still read as installed.
    const start = html.indexOf('data-testid="tile-mg12"');
    const chunk = html.slice(start, start + 200);
    expect(chunk).not.toMatch(/\bnot-installed\b/);
  });
});
