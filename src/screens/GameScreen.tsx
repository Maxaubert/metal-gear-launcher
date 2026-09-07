import { useEffect } from "react";
import type { GameState } from "@shared/ipc";
import type { Pack } from "@shared/packs";
import type { InputKind } from "../input/useNavigation";
import { themeVars, layoutVars } from "../theme/theme";
import ScreenBackdrop from "./ScreenBackdrop";
import FooterHints from "./FooterHints";

export type MenuKey = Pack["menu"][number];

export const MENU_LABELS: Record<MenuKey, string> = {
  start: "Start Game",
  gameSelection: "Game Selection",
  quit: "QUIT GAME",
};

const MAX_PADS = 4;

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
 * The per-game screen (spec 4.7): `ScreenBackdrop` renders the vertical logo strip, floating
 * main visual and header block on the paper-textured left zone; this adds the description, menu
 * and footer that make it the live game screen (as opposed to `GameSelection`, which renders the
 * same backdrop for the focused entry with a banner list instead).
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
      className="screen"
      data-testid="game-screen"
      data-game={pack.id}
      data-layout="v2"
      style={{ ...themeVars(pack.theme), ...layoutVars() }}
    >
      <ScreenBackdrop pack={pack} assetUrls={assetUrls} />

      {/* A `chapters` pack (defect 4: MG1&2) renders its own two descriptions inside
          ScreenBackdrop, one per chapter, instead of this single pack-level one. */}
      {!pack.chapters && (
        <div key={`${pack.id}-desc`} className="fade-in-fast">
          <p className="description">{pack.description}</p>
        </div>
      )}

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

      <FooterHints lastInputKind={lastInputKind} />

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
