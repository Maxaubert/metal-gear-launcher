import { useEffect } from "react";
import type { GameState } from "@shared/ipc";
import type { Pack } from "@shared/packs";

export type MenuKey = Pack["menu"][number];

export const MENU_LABELS: Record<MenuKey, string> = {
  start: "Start Game",
  gameSelection: "Game Selection",
  quit: "Quit",
};

const HINTS: readonly [string, string][] = [
  ["LB/RB", "Previous / Next game"],
  ["A", "Confirm"],
  ["Start", "Game Selection"],
];

const ROW_BORDER = "1px solid color-mix(in srgb, var(--ink) 40%, transparent)";
const MAX_PADS = 4;

export type GameScreenProps = {
  game: GameState;
  menuItem: number;
  launching: boolean;
  quitOpen: boolean;
  quitItem: number;
  onSelectMenuItem: (index: number) => void;
  onQuitSelect: (index: number) => void;
  onRetryExtract: () => void;
};

/**
 * The per-game screen: logo strip and main visual on the left, numbering/year/description
 * and the start/selection/quit menu on the right. Renders text fallbacks for any of the
 * five art roles that failed to extract instead of leaving a blank frame.
 */
export default function GameScreen({
  game,
  menuItem,
  launching,
  quitOpen,
  quitItem,
  onSelectMenuItem,
  onQuitSelect,
  onRetryExtract,
}: GameScreenProps) {
  const { pack, assetUrls } = game;
  const hasLogo = Boolean(assetUrls.logo) && pack.id !== "mg12";
  const hasMainVisual = Boolean(assetUrls.mainVisual);

  // Y (gamepad button 3) and the R key retry a failed extraction while the hero art is missing.
  useEffect(() => {
    if (hasMainVisual) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyR") onRetryExtract();
    };
    window.addEventListener("keydown", onKeyDown);

    const wasDown = new Array<boolean>(MAX_PADS).fill(false);
    let frame = 0;
    const poll = () => {
      const pads = navigator.getGamepads();
      for (let i = 0; i < MAX_PADS; i++) {
        const down = Boolean(pads[i]?.buttons[3]?.pressed);
        if (down && !wasDown[i]) onRetryExtract();
        wasDown[i] = down;
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [hasMainVisual, onRetryExtract]);

  return (
    <div
      className="screen-root"
      data-testid="game-screen"
      data-game={pack.id}
      style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr" }}
    >
      <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
        <div className="dots" style={{ position: "absolute", inset: 0 }} />
        {assetUrls.bgEffect && (
          <img
            src={assetUrls.bgEffect}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.25 }}
          />
        )}
        <div
          style={{
            position: "absolute", left: 0, top: 0, height: "100%", width: "10rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {hasLogo ? (
            <img src={assetUrls.logo} alt={pack.title} style={{ maxHeight: "90%", maxWidth: "100%", objectFit: "contain" }} />
          ) : (
            <span
              style={{
                writingMode: "vertical-rl", transform: "rotate(180deg)",
                color: "var(--accent)", fontSize: "2rem", letterSpacing: "0.15em", fontWeight: 700,
              }}
            >
              {pack.shortTitle}
            </span>
          )}
        </div>
        {hasMainVisual ? (
          <img
            src={assetUrls.mainVisual}
            alt={pack.title}
            style={{
              position: "absolute", bottom: 0, left: "10rem", right: 0, margin: "0 auto",
              maxHeight: "92vh", maxWidth: "calc(100% - 10rem)", height: "auto", width: "auto", objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "1rem", textAlign: "center", padding: "0 1rem",
            }}
          >
            <span style={{ fontSize: "12rem", fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>{pack.number}</span>
            <span style={{ fontSize: "1rem" }}>assets incomplete, press Y to retry extraction</span>
          </div>
        )}
      </div>

      <div style={{ padding: "3rem", position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {assetUrls.numbering && (
            <img src={assetUrls.numbering} alt="" style={{ height: "9rem", objectFit: "contain" }} />
          )}
        </div>
        <div style={{ marginTop: "1rem" }}>
          {assetUrls.year && <img src={assetUrls.year} alt={pack.yearLabel} style={{ height: "5rem", objectFit: "contain" }} />}
          <div style={{ fontSize: "1.2rem", letterSpacing: "0.1em", marginTop: "0.5rem" }}>{pack.subtitle}</div>
        </div>
        <p
          style={{
            fontSize: "1rem", marginTop: "1rem", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 7, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {pack.description}
        </p>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {pack.menu.map((key, index) => (
            <div
              key={key}
              data-testid={`menu-item-${key}`}
              className={menuItem === index ? "focused" : undefined}
              onClick={() => onSelectMenuItem(index)}
              style={{
                height: "3rem", display: "flex", alignItems: "center", paddingLeft: "1rem",
                border: ROW_BORDER, cursor: "pointer", fontSize: "1.1rem",
              }}
            >
              {MENU_LABELS[key]}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "2rem", fontSize: "0.8rem", opacity: 0.8 }}>
          {HINTS.map(([button, label]) => (
            <span key={button}>
              <strong>{button}</strong>&nbsp;&nbsp;{label}
            </span>
          ))}
        </div>
      </div>

      {launching && (
        <div
          style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem",
          }}
        >
          Launching...
        </div>
      )}

      {quitOpen && (
        <div
          style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ background: "var(--paper)", padding: "2rem", display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "16rem" }}>
            {(["Quit", "Cancel"] as const).map((label, index) => (
              <div
                key={label}
                className={quitItem === index ? "focused" : undefined}
                onClick={() => onQuitSelect(index)}
                style={{ height: "3rem", display: "flex", alignItems: "center", justifyContent: "center", border: ROW_BORDER, cursor: "pointer" }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
