import type { GameState } from "@shared/ipc";

export type GameSelectionProps = {
  games: GameState[];
  focusIndex: number;
  onSelect: (index: number) => void;
};

/**
 * Full-screen overlay grid (3 columns) for jumping straight to a game. Tiles for a game
 * that isn't installed are greyed out but still selectable - picking one just lands on
 * that game's `NotInstalled` screen.
 */
export default function GameSelection({ games, focusIndex, onSelect }: GameSelectionProps) {
  return (
    <div
      className="selection-overlay screen-root"
      data-testid="game-selection"
      style={{
        position: "absolute", inset: 0, background: "var(--paper)",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem",
        padding: "3rem", alignContent: "center",
      }}
    >
      {games.map((g, index) => (
        <div
          key={g.pack.id}
          data-testid={`tile-${g.pack.id}`}
          onClick={() => onSelect(index)}
          className={index === focusIndex ? "focused" : undefined}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            padding: "1.5rem", cursor: "pointer",
            border: g.installed ? "1px solid color-mix(in srgb, var(--ink) 30%, transparent)" : "1px dashed color-mix(in srgb, var(--ink) 30%, transparent)",
          }}
        >
          {/* Dim only the artwork, not the title text below it, so a not-installed tile stays
              legible instead of dropping under the 4.5:1 contrast floor. */}
          <div style={{ opacity: g.installed ? 1 : 0.4 }}>
            {g.assetUrls.numbering ? (
              <img src={g.assetUrls.numbering} alt="" style={{ height: "4rem", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: "2.5rem", fontWeight: 700 }}>{g.pack.number}</span>
            )}
          </div>
          <span style={{ fontSize: "1.1rem" }}>{g.pack.shortTitle}</span>
        </div>
      ))}
    </div>
  );
}
