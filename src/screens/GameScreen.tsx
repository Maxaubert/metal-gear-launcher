import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { GameState } from "@shared/ipc";
import type { Pack } from "@shared/packs";
import type { InputKind } from "../input/useNavigation";
import { themeVars, layoutVars } from "../theme/theme";

export type MenuKey = Pack["menu"][number];

export const MENU_LABELS: Record<MenuKey, string> = {
  start: "Start Game",
  gameSelection: "Game Selection",
  quit: "QUIT GAME",
};

type Hint = { glyph: string; label: string };

const HINTS_GAMEPAD: readonly Hint[] = [
  { glyph: "L", label: "Move cursor" },
  { glyph: "A", label: "Confirm" },
  { glyph: "B", label: "Back" },
];
const HINTS_OTHER: readonly Hint[] = [
  { glyph: "↕", label: "Arrows" },
  { glyph: "⏎", label: "Enter" },
  { glyph: "Esc", label: "Back" },
];

const MAX_PADS = 4;

// D2: per-pack override of `.main-visual`'s box so the key art can bleed past the bottom edge
// like the originals (spec 4.7's `visualFit` pack field). `undefined` when the pack omits the
// field, so the shared `.main-visual` CSS rule's own defaults (bottom-anchored, 94vh/11vw/50vw)
// apply unchanged - only mgs1/mgs2/mgs3 currently set this.
function visualFitStyle(fit: Pack["visualFit"]): CSSProperties | undefined {
  if (!fit) return undefined;
  return {
    top: fit.anchor === "top" ? 0 : "auto",
    bottom: fit.anchor === "bottom" ? 0 : "auto",
    height: `${fit.heightVh}vh`,
    left: `${fit.leftVw}vw`,
    width: `${fit.widthVw}vw`,
    objectPosition: fit.anchor === "top" ? "center top" : "center bottom",
  };
}

// D7: the header mark block's three "serial" lines are decorative hex digits (spec 4.7 doesn't
// assign them any real meaning) - derived from the pack's own Steam app ID so they're stable
// across renders and distinct per game, rather than re-randomized on every paint.
function hexDigits(seed: number, length: number): string {
  let n = (seed >>> 0) || 1;
  let out = "";
  for (let i = 0; i < length; i++) {
    out += (n & 0xf).toString(16).toUpperCase();
    n = (Math.imul(n, 48271) + 1 + i) >>> 0;
  }
  return out;
}

export type GameScreenProps = {
  game: GameState;
  menuItem: number;
  launching: boolean;
  quitOpen: boolean;
  quitItem: number;
  lastInputKind: InputKind;
  onSelectMenuItem: (index: number) => void;
  onQuitSelect: (index: number) => void;
  onRetryExtract: () => void;
};

/**
 * The per-game screen (spec 4.7): a vertical logo strip and floating main visual on the
 * paper-textured left zone, a normalized header/description/menu column on the right, sized
 * entirely in viewport units so 1080p and 2160p read identically. Renders text fallbacks for
 * any of the five art roles that failed to extract instead of leaving a blank frame.
 */
export default function GameScreen({
  game,
  menuItem,
  launching,
  quitOpen,
  quitItem,
  lastInputKind,
  onSelectMenuItem,
  onQuitSelect,
  onRetryExtract,
}: GameScreenProps) {
  const { pack, assetUrls } = game;
  const hasLogo = Boolean(assetUrls.logo) && pack.id !== "mg12";
  const hasMainVisual = Boolean(assetUrls.mainVisual);
  // Every pack's assets array is required (min 1) to contain a mainVisual entry (tests/packs.test.ts);
  // the `!` mirrors that guarantee rather than re-checking it at render time.
  const mainVisualAsset = pack.assets.find((a) => a.role === "mainVisual")!;
  const hints = lastInputKind === "gamepad" ? HINTS_GAMEPAD : HINTS_OTHER;
  const visualStyle = visualFitStyle(pack.visualFit);
  const serialLines = [hexDigits(pack.steam.appId, 24), hexDigits(pack.steam.appId + 1, 24), hexDigits(pack.steam.appId + 2, 24)];

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
      className="screen"
      data-testid="game-screen"
      data-game={pack.id}
      data-layout="v2"
      style={{ ...themeVars(pack.theme), ...layoutVars() }}
    >
      <div className="ground" />

      <div key={pack.id} className="left-zone fade-in">
        {assetUrls.bgEffect && <img className="ghost-effect" src={assetUrls.bgEffect} alt="" />}
        {hasLogo ? (
          <img className="logo-strip" src={assetUrls.logo} alt={pack.title} />
        ) : (
          <div className="logo-text">{pack.shortTitle}</div>
        )}
        {hasMainVisual ? (
          <img
            className={`main-visual edge-${mainVisualAsset.edge}`}
            src={assetUrls.mainVisual}
            alt={pack.title}
            style={visualStyle}
          />
        ) : (
          <div className="main-visual-fallback">
            <span className="fallback-number">{pack.number}</span>
            <span className="fallback-hint">assets incomplete, press Y to retry extraction</span>
          </div>
        )}
      </div>

      <div className="divider" />

      <div key={`${pack.id}-ghosts`} className="fade-in">
        {assetUrls.year && <img className="ghost-timeline" src={assetUrls.year} alt="" />}
        {assetUrls.numbering && <img className="ghost-number" src={assetUrls.numbering} alt="" />}
      </div>

      <div key={`${pack.id}-text`} className="fade-in-fast">
        <header className="head">
          <span className="tick" />
          <h1 className="year">{pack.yearLabel}</h1>
          <p className="subtitle">
            {pack.subtitle.split(" / ").map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
          <div className="mark">
            <div className="mark-text">
              <div className="mark-serial" aria-hidden="true">
                {serialLines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </div>
              <div className="mark-code">
                <span className="barcode" aria-hidden="true" />
                <span className="index">[ {pack.indexLabel} ]</span>
              </div>
            </div>
            <div className="mark-accent">
              <span className="rule" aria-hidden="true" />
              <span className="bang">!</span>
              <span className="rule" aria-hidden="true" />
            </div>
          </div>
        </header>
        <p className="description">{pack.description}</p>
      </div>

      <ul className="menu">
        <li
          className="menu-bar"
          aria-hidden
          style={{ transform: `translateY(calc(${menuItem} * (var(--row-h) + var(--row-gap))))` }}
        />
        {pack.menu.map((key, index) => (
          <li
            key={key}
            data-testid={`menu-item-${key}`}
            className={[index === menuItem ? "focused" : "", key === "quit" ? "quit" : ""].filter(Boolean).join(" ")}
            onClick={() => onSelectMenuItem(index)}
          >
            {MENU_LABELS[key]}
          </li>
        ))}
      </ul>

      <footer className="hints">
        {hints.map((h) => (
          <span key={h.label}>
            <i className="glyph">{h.glyph}</i>
            {h.label}
          </span>
        ))}
      </footer>

      {launching && (
        <div className="overlay">
          <span>Launching...</span>
        </div>
      )}

      {quitOpen && (
        <div className="overlay">
          <div className="overlay-panel">
            {(["Quit", "Cancel"] as const).map((label, index) => (
              <div
                key={label}
                className={quitItem === index ? "focused" : undefined}
                onClick={() => onQuitSelect(index)}
                style={{ height: "3rem", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--ink)", cursor: "pointer" }}
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
