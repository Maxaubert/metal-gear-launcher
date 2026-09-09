import type { CSSProperties } from "react";
import type { GameState } from "@shared/ipc";
import type { BonusPresentation } from "@shared/bonus";
import { bonusSceneVars, EMPTY_BONUS_PRESENTATION } from "../bonus/BonusScene";
import type { InputKind } from "../input/useNavigation";
import { themeVars, layoutVars } from "../theme/theme";
import FooterHints from "./FooterHints";
import "./selectionMotion.css";

export type GameSelectionProps = {
  games: GameState[];
  bonusPresentation?: BonusPresentation;
  focusIndex: number;
  lastInputKind: InputKind;
  onSelect: (index: number) => void;
  onFocusItem: (index: number) => void;
};

/**
 * Game Selection (round 6, matching `reference/ref-13.png`): NOT a dark overlay. It is the same
 * light game screen - `ScreenBackdrop` renders the focused entry's own ground, logo strip, main
 * visual and header block, exactly as `GameScreen` would - with the description and menu swapped
 * for a small "Game Selection" header row and a banner list, one row per game. Moving the cursor
 * swaps the focused entry, so the left zone's art and header change with it. A tile for a game
 * that isn't installed stays focusable and visibly marked; selecting it explains the missing
 * installation without leaving the list.
 */
export default function GameSelection({ games, bonusPresentation = EMPTY_BONUS_PRESENTATION, focusIndex, lastInputKind, onSelect, onFocusItem }: GameSelectionProps) {
  const bonusFocused = focusIndex === games.length;
  const focused = games[focusIndex] ?? games[0];
  if (!focused) return null;

  return (
    <div
      className="screen"
      data-testid="game-selection"
      data-game={bonusFocused ? "bonus" : focused.pack.id}
      data-bonus-focused={bonusFocused || undefined}
      data-layout="v2"
      style={{ ...(bonusFocused ? bonusSceneVars(bonusPresentation) : { ...themeVars(focused.pack.theme), ...layoutVars(focused.pack.id) }), "--selection-row-height": "8vh" } as CSSProperties}
    >

      {!bonusFocused && <div className="selection-info">
        <span className="title">{focused.pack.title}</span>
        <span className="released">{`Originally released in ${focused.pack.releaseYear}`}</span>
      </div>}

      <div className="selection-header">
        <span className="tick" aria-hidden="true" />
        <span className="label">Game Selection</span>
      </div>

      <div className="selection-marker" aria-hidden="true"
        style={{ "--selection-index": focusIndex } as CSSProperties} />
      <ul className="selection-list" role="menu" aria-label="Game selection">
        {games.map((g, index) => (
          <li
            key={g.pack.id}
            role="menuitem"
            tabIndex={-1}
            aria-current={index === focusIndex ? "true" : undefined}
            aria-disabled={!g.installed || undefined}
            data-testid={`tile-${g.pack.id}`}
            data-focused={index === focusIndex ? "true" : undefined}
            className={`tile${index === focusIndex ? " focused" : ""}${g.installed ? "" : " not-installed"}`}
            onClick={() => onSelect(index)}
            onPointerMove={(event) => { if (event.pointerType !== "touch") onFocusItem(index); }}
            onFocus={() => onFocusItem(index)}
          >
            {g.assetUrls.mainVisual && <img className="tile-cover" src={g.assetUrls.mainVisual} alt="" />}
            <span className="tile-scrim" aria-hidden="true" />
            <span className="tile-bar" aria-hidden="true" />
            <span className="tile-title">{g.pack.shortTitle}</span>
            {!g.installed && <span className="tile-install-status">Not installed</span>}
            {!g.pack.chapters && <span className="tile-number" style={{ color: g.pack.theme.accent }}>
              {g.pack.number}
            </span>}
          </li>
        ))}
        <li role="menuitem" tabIndex={-1} data-testid="tile-bonus" aria-current={bonusFocused ? "true" : undefined}
          data-focused={bonusFocused ? "true" : undefined} className={`tile bonus-tile${bonusFocused ? " focused" : ""}`}
          onClick={() => onSelect(games.length)} onFocus={() => onFocusItem(games.length)}
          onPointerMove={event => { if (event.pointerType !== "touch") onFocusItem(games.length); }}>
          {bonusPresentation.artwork.mainVisual && <img className="tile-cover" src={bonusPresentation.artwork.mainVisual} alt="" />}
          <span className="tile-scrim" aria-hidden="true" />
          <span className="tile-title">BONUS CONTENT</span>
        </li>
      </ul>

      <FooterHints lastInputKind={lastInputKind} />
    </div>
  );
}
