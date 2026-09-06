import { useEffect, useReducer, useRef, useState } from "react";
import type { GameState, HubState, Progress } from "@shared/ipc";
import { PACK_ORDER } from "@shared/packs";
import { navigate, type Action, type NavState } from "../input/navigationReducer";
import { useNavigation } from "../input/useNavigation";
import { useMenuMusic } from "../audio/useMenuMusic";
import { themeVars } from "../theme/theme";
import GameScreen, { type MenuKey } from "../screens/GameScreen";
import GameSelection from "../screens/GameSelection";
import FirstRun, { type ExtractProgress } from "../screens/FirstRun";
import NotInstalled from "../screens/NotInstalled";

const INITIAL_NAV: NavState = { screen: "hub", game: 0, item: 0, menuLength: 3, gameCount: PACK_ORDER.length };
const LAUNCH_MESSAGE_MS = 3000;
const FONT_STYLE_ID = "hub-font-face";

// `navigate` (Task 8) only understands relative moves, so clicking a specific tile in
// `GameSelection` is handled as a local pseudo-action here rather than by extending its
// `Action` union.
type SelectGame = { type: "selectGame"; index: number };

function reduceNav(state: NavState, action: Action | SelectGame): NavState {
  if (typeof action === "object") return { ...state, screen: "hub", game: action.index, item: 0 };
  return navigate(state, action);
}

export default function HubProvider() {
  const [hubState, setHubState] = useState<HubState | null>(null);
  const [nav, dispatch] = useReducer(reduceNav, INITIAL_NAV);
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitItem, setQuitItem] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [firstRunItem, setFirstRunItem] = useState(0);
  const [extractingAll, setExtractingAll] = useState(false);
  const [progress, setProgress] = useState<Record<string, ExtractProgress>>({});
  const [volume, setVolume] = useState(0.6);
  const hasActedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void window.hub.getState().then((r) => {
      if (cancelled || !r.ok) return;
      setHubState(r.value);
      if (r.value.startGame) {
        const index = PACK_ORDER.indexOf(r.value.startGame);
        if (index >= 0) dispatch({ type: "selectGame", index });
      }
    });
    void window.hub.getConfig().then((r) => {
      if (!cancelled && r.ok) setVolume(r.value.volume);
    });
    const offSelectGame = window.hub.onSelectGame((id) => {
      if (cancelled) return;
      const index = PACK_ORDER.indexOf(id);
      if (index >= 0) dispatch({ type: "selectGame", index });
    });
    const off = window.hub.onExtractProgress((p: Progress) => {
      if (cancelled) return;
      setProgress((prev) => {
        const failedSoFar = prev[p.gameId]?.failed ?? 0;
        return {
          ...prev,
          [p.gameId]: {
            total: p.total,
            completed: p.status === "start" ? p.index : p.index + 1,
            failed: failedSoFar + (p.status === "failed" ? 1 : 0),
          },
        };
      });
    });
    return () => {
      cancelled = true;
      offSelectGame();
      off();
    };
  }, []);

  const games = hubState?.games ?? [];
  const currentGame: GameState | undefined = games[nav.game];
  const mgs3Game = games.find((g) => g.pack.id === "mgs3");
  const needsFirstRun = games.some((g) => g.installed && (!g.assets || g.stale));

  // Remembers the current game so the next launch with no `--game` argument opens on it.
  useEffect(() => {
    const id = currentGame?.pack.id;
    if (!id) return;
    void window.hub.setConfig({ lastGame: id });
  }, [currentGame?.pack.id]);

  const music = useMenuMusic(currentGame?.assetUrls.bgm, volume);

  // Font: the current game's medium weight, falling back to MGS3's, falling back to the
  // system font already declared in global.css when neither has been extracted yet.
  useEffect(() => {
    const fontUrl = currentGame?.assetUrls.fontMedium ?? mgs3Game?.assetUrls.fontMedium;
    let styleEl = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null;
    if (!fontUrl) {
      styleEl?.remove();
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = FONT_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@font-face { font-family: "Rodin"; src: url("${fontUrl}"); }`;
  }, [currentGame?.assetUrls.fontMedium, mgs3Game?.assetUrls.fontMedium]);

  // Theme: the current game's colours become CSS custom properties on <html>.
  useEffect(() => {
    if (!currentGame) return;
    const vars = themeVars(currentGame.pack.theme);
    for (const [key, value] of Object.entries(vars)) document.documentElement.style.setProperty(key, value);
  }, [currentGame]);

  async function refreshState(): Promise<void> {
    const r = await window.hub.getState();
    if (r.ok) setHubState(r.value);
  }

  async function handleMenuChoice(key: MenuKey): Promise<void> {
    if (!currentGame) return;
    if (key === "start") {
      setLaunching(true);
      await window.hub.launch(currentGame.pack.id);
      window.setTimeout(() => setLaunching(false), LAUNCH_MESSAGE_MS);
    } else if (key === "gameSelection") {
      dispatch("menu");
    } else {
      setQuitItem(0);
      setQuitOpen(true);
    }
  }

  function handleQuitChoice(index: number): void {
    if (index === 0) void window.hub.quit();
    else setQuitOpen(false);
  }

  async function handleRetryExtract(): Promise<void> {
    if (!currentGame) return;
    await window.hub.extract(currentGame.pack.id);
    await refreshState();
  }

  async function handleStartExtraction(): Promise<void> {
    setExtractingAll(true);
    await window.hub.extract("all");
    setExtractingAll(false);
    await refreshState();
  }

  async function handlePickFolder(): Promise<void> {
    const picked = await window.hub.pickFolder();
    if (!picked.ok) return;
    const r = await window.hub.setSteamPath(picked.value);
    if (r.ok) setHubState(r.value);
  }

  function firstRunRows(): { onSelect: () => void }[] {
    const rows: { onSelect: () => void }[] = [];
    if (!hubState?.steamPath) rows.push({ onSelect: () => void handlePickFolder() });
    rows.push({ onSelect: () => void handleStartExtraction() });
    return rows;
  }

  const onAction = (action: Action) => {
    if (!hasActedRef.current) {
      hasActedRef.current = true;
      music.unlock();
    }

    if (needsFirstRun) {
      const rows = firstRunRows();
      if (action === "up" || action === "down") {
        setFirstRunItem((i) => (i + (action === "up" ? rows.length - 1 : 1)) % rows.length);
      } else if (action === "confirm") {
        rows[firstRunItem]?.onSelect();
      }
      return;
    }

    if (quitOpen) {
      if (action === "up" || action === "down") setQuitItem((i) => (i === 0 ? 1 : 0));
      else if (action === "confirm") handleQuitChoice(quitItem);
      else if (action === "back") setQuitOpen(false);
      return;
    }

    if (nav.screen === "hub") {
      if (action === "confirm" && currentGame) {
        void handleMenuChoice(currentGame.pack.menu[nav.item] ?? "start");
        return;
      }
      if (action === "back") {
        setQuitItem(0);
        setQuitOpen(true);
        return;
      }
    }

    dispatch(action);
  };

  useNavigation(onAction);

  if (!hubState) return <div className="screen-root" />;

  if (needsFirstRun) {
    return (
      <FirstRun
        games={games}
        steamPath={hubState.steamPath}
        progress={progress}
        focusIndex={firstRunItem}
        extracting={extractingAll}
        onPickFolder={() => void handlePickFolder()}
        onStart={() => void handleStartExtraction()}
      />
    );
  }

  if (!currentGame) return <div className="screen-root" />;

  return (
    <>
      <div key={currentGame.pack.id} className="game-fade" style={{ position: "absolute", inset: 0 }}>
        {currentGame.installed ? (
          <GameScreen
            game={currentGame}
            menuItem={nav.item}
            launching={launching}
            quitOpen={quitOpen}
            quitItem={quitItem}
            onSelectMenuItem={(index) => void handleMenuChoice(currentGame.pack.menu[index] ?? "start")}
            onQuitSelect={handleQuitChoice}
            onRetryExtract={() => void handleRetryExtract()}
          />
        ) : (
          <NotInstalled game={currentGame} onInstall={() => void window.hub.launch(currentGame.pack.id, { install: true })} />
        )}
      </div>
      {nav.screen === "selection" && (
        <GameSelection games={games} focusIndex={nav.item} onSelect={(index) => dispatch({ type: "selectGame", index })} />
      )}
    </>
  );
}
