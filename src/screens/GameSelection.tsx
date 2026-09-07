import type { GameState } from "@shared/ipc";
import { layoutVars } from "../theme/theme";

export type GameSelectionProps = {
  games: GameState[];
  focusIndex: number;
  onSelect: (index: number) => void;
};

/**
 * Full-screen dark overlay (spec 4.7) for jumping straight to a game: the right column
 * becomes a vertically centred list of banner tiles, one per game, while the left zone shows
 * the focused game's own logo strip and main visual dimmed to 60% with a release-year info
 * block. A tile for a game that isn't installed is still selectable - picking one just lands
 * on that game's `NotInstalled` screen.
 */
export default function GameSelection({ games, focusIndex, onSelect }: GameSelectionProps) {
  const focused = games[focusIndex];
  const hasLogo = focused && Boolean(focused.assetUrls.logo) && focused.pack.id !== "mg12";

  return (
    <div
      className="screen-root selection-overlay"
      data-testid="game-selection"
      style={{ position: "fixed", inset: 0, ...layoutVars() }}
    >
      <div className="selection-scrim" />
      {focused && (
        <div className="selection-left">
          {hasLogo ? (
            <img className="logo-strip" src={focused.assetUrls.logo} alt={focused.pack.title} />
          ) : (
            <div className="logo-text">{focused.pack.shortTitle}</div>
          )}
          {focused.assetUrls.mainVisual && (
            <img className="main-visual" src={focused.assetUrls.mainVisual} alt={focused.pack.title} />
          )}
          <div className="selection-info">
            <span className="title">{focused.pack.title}</span>
            <span className="released">Originally released in {focused.pack.releaseYear}</span>
          </div>
        </div>
      )}
      <ul className="selection-list">
        {games.map((g, index) => (
          <li
            key={g.pack.id}
            data-testid={`tile-${g.pack.id}`}
            className={`tile${index === focusIndex ? " focused" : ""}`}
            onClick={() => onSelect(index)}
          >
            {g.assetUrls.mainVisual && <img className="tile-cover" src={g.assetUrls.mainVisual} alt="" />}
            <span className="tile-bar" aria-hidden />
            <span className="tile-title">{g.pack.shortTitle}</span>
            <span className="tile-number" style={{ color: g.pack.theme.accent }}>
              {g.pack.number}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
