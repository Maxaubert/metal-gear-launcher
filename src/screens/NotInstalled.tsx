import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { GameState } from "@shared/ipc";
import type { Action } from "../input/navigationReducer";
import type { InputKind } from "../input/useNavigation";
import { playMenuSound } from "../audio/menuSounds";
import { ControlHint } from "./FooterHints";
import neutralWordmark from "../assets/neutral-wordmark.png";
import "./notInstalled.css";

type Props = {
  game: GameState;
  installedCount: number;
  actionRef: RefObject<((action: Action) => void) | null>;
  lastInputKind: InputKind;
  onGameSelection: () => void;
  onInstall: () => void;
  onLocateSteam: () => void;
  onQuit: () => void;
};

export default function NotInstalled({ game, installedCount, actionRef, lastInputKind, onGameSelection, onInstall, onLocateSteam, onQuit }: Props) {
  const empty = installedCount === 0;
  const [selected, setSelected] = useState(0);
  const selection = useRef(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const rows = [
    { label: "Game Selection", activate: onGameSelection },
    empty ? { label: "Choose Steam folder", activate: onLocateSteam } : { label: "Install on Steam", activate: onInstall },
    { label: "Quit Launcher", activate: onQuit },
  ];
  function focus(index: number) {
    if (index === selection.current) return;
    selection.current = index;
    void playMenuSound("navigate");
    setSelected(index);
  }
  useLayoutEffect(() => {
    actionRef.current = action => {
      if (action === "up" || action === "down") {
        const index = (selected + (action === "up" ? rows.length - 1 : 1)) % rows.length;
        focus(index);
        buttons.current[index]?.focus();
      } else if (action === "confirm") rows[selected]?.activate();
      else if (action === "menu" || action === "back") onGameSelection();
    };
    return () => { actionRef.current = null; };
  });

  return <main className="uninstalled-screen" data-testid="not-installed-screen" aria-labelledby="uninstalled-title">
    <header className="uninstalled-header">METAL GEAR LAUNCHER</header>
    <div className="uninstalled-layout">
      <div className="uninstalled-brand">
        <img src={neutralWordmark} width={2172} height={724} alt="Metal Gear Solid" draggable={false} />
      </div>
      <section className="uninstalled-content">
        <h1 id="uninstalled-title">{empty ? "No games installed" : game.pack.shortTitle}</h1>
        {!empty && <p className="uninstalled-game-title">{game.pack.title}</p>}
        {!empty && <p className="uninstalled-status">Not installed</p>}
        <p className="uninstalled-description">{empty
          ? "Install a supported Metal Gear game through Steam, then reopen the launcher. If your games are already installed, choose your Steam folder."
          : "This game is not installed. Choose another game from your library, or install this one through Steam."}</p>
        <nav className="uninstalled-actions" aria-label="Library actions">
          {rows.map((row, index) => <button type="button" key={row.label}
            ref={node => { buttons.current[index] = node; }}
            aria-current={selected === index ? "true" : undefined}
            onFocus={() => focus(index)} onMouseEnter={() => focus(index)} onClick={row.activate}>{row.label}</button>)}
        </nav>
      </section>
    </div>
    <footer className="uninstalled-footer">
      <ControlHint lastInputKind={lastInputKind} keyboard={["↑", "↓"]} gamepad="L" label="Move cursor" />
      <ControlHint lastInputKind={lastInputKind} keyboard="Enter" gamepad="A" label="Confirm" />
      <ControlHint lastInputKind={lastInputKind} keyboard="Tab" gamepad="B" label="Game Selection" />
    </footer>
  </main>;
}
