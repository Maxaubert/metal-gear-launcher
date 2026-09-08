import type { GameState } from "@shared/ipc";
import type { InputKind } from "../input/useNavigation";
import { themeVars, layoutVars } from "../theme/theme";
import FooterHints from "./FooterHints";

export type GameSelectionProps = {
  games: GameState[];
  focusIndex: number;
  lastInputKind: InputKind;
  onSelect: (index: number) => void;
};

/**
 * Game Selection (round 6, matching `reference/ref-13.png`): NOT a dark overlay. It is the same
 * light game screen - `ScreenBackdrop` renders the focused entry's own ground, logo strip, main
 * visual and header block, exactly as `GameScreen` would - with the description and menu swapped
 * for a small "Game Selection" header row and a banner list, one row per game. Moving the cursor
 * swaps the focused entry, so the left zone's art and header change with it. A tile for a game
 * that isn't installed is still selectable - picking one just lands on that game's `NotInstalled`
 * screen - but stays visually marked (dashed border, dimmed cover, greyed label) so the list still
 * shows which games need Steam install/extraction.
 */
export default function GameSelection({ games, focusIndex, lastInputKind, onSelect }: GameSelectionProps) {
  const focused = games[focusIndex];
  if (!focused) return null;

  return (
    <div
      className="screen"
      data-testid="game-selection"
      data-game={focused.pack.id}
      data-layout="v2"
      style={{ ...themeVars(focused.pack.theme), ...layoutVars(focused.pack.id) }}
    >

      <div className="selection-info">
        <span className="title">{focused.pack.title}</span>
        <span className="released">Originally released in {focused.pack.releaseYear}</span>
      </div>

      <div className="selection-header">
        <span className="tick" aria-hidden="true" />
        <span className="label">Game Selection</span>
      </div>

      <ul className="selection-list">
        {games.map((g, index) => (
          <li
            key={g.pack.id}
            data-testid={`tile-${g.pack.id}`}
            data-focused={index === focusIndex ? "true" : undefined}
            className={`tile${index === focusIndex ? " focused" : ""}${g.installed ? "" : " not-installed"}`}
            onClick={() => onSelect(index)}
          >
            {g.assetUrls.mainVisual && <img className="tile-cover" src={g.assetUrls.mainVisual} alt="" />}
            <span className="tile-scrim" aria-hidden="true" />
            <span className="tile-bar" aria-hidden="true" />
            <span className="tile-title">{g.pack.shortTitle}</span>
            {!g.pack.chapters && <span className="tile-number" style={{ color: g.pack.theme.accent }}>
              {g.pack.number}
            </span>}
          </li>
        ))}
      </ul>

      <FooterHints lastInputKind={lastInputKind} />
    </div>
  );
}
