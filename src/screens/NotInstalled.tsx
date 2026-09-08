import type { GameState } from "@shared/ipc";

export type NotInstalledProps = {
  game: GameState;
  onInstall: () => void;
};

/** Greyed variant of the hub screen for a game that isn't installed: one row, install on Steam. */
export default function NotInstalled({ game, onInstall }: NotInstalledProps) {
  return (
    <div className="screen-root">
      {/* A separate, absolutely-positioned layer: `.dots` carries its own opacity, which
          would otherwise wash out the text if applied to the container that holds it. */}
      <div className="dots" style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "relative", height: "100%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5rem",
        }}
      >
        {/* Full-contrast text throughout: "greyed" comes from the dashed border and the
            de-emphasised layout, not from dimming text below the 4.5:1 contrast floor. */}
        <span style={{ fontSize: "3rem", fontWeight: 700 }}>{game.pack.shortTitle}</span>
        <span style={{ fontSize: "1.2rem", letterSpacing: "0.1em" }}>{game.pack.title}</span>
        <span style={{ fontSize: "1rem", border: "1px dashed color-mix(in srgb, var(--ink) 40%, transparent)", padding: "0.5rem 1rem" }}>
          Not installed
        </span>
        <div
          className="focused"
          onClick={onInstall}
          style={{ height: "3rem", minWidth: "16rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "1.1rem" }}
        >
          Install on Steam
        </div>
      </div>
    </div>
  );
}
