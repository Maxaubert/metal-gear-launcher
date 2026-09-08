import { useEffect, useReducer, useRef, useState } from "react";
import type { GameState, HubState, Progress, UpdateInfo } from "@shared/ipc";
import { PACK_ORDER } from "@shared/packs";
import { navigate, type Action, type NavState } from "../input/navigationReducer";
import { useNavigation } from "../input/useNavigation";
import { useMenuMusic } from "../audio/useMenuMusic";
import { themeVars } from "../theme/theme";
import GameScreen, { type MenuKey } from "../screens/GameScreen";
import GameSelection from "../screens/GameSelection";
import FirstRun, { type ExtractProgress } from "../screens/FirstRun";
import NotInstalled from "../screens/NotInstalled";
import SettingsScreen from "../settings/SettingsScreen";
import PersistentBackdrop from "../screens/PersistentBackdrop";
import { useGameSettingsCache } from "../settings/useGameSettingsCache";
import { preloadPresentation } from "./preloadPresentation";
import { resolveMenuMusic, type MenuMusicSelections } from "@shared/menuMusic";

const INITIAL_NAV: NavState = { screen: "hub", game: 0, item: 0, menuLength: 4, gameCount: PACK_ORDER.length };
const LAUNCH_MESSAGE_MS = 3000;
const MAX_PADS = 4;

// `navigate` (Task 8) only understands relative moves, so clicking a specific tile in
// `GameSelection` is handled as a local pseudo-action here rather than by extending its
// `Action` union.
type SelectGame = { type: "selectGame"; index: number };

function reduceNav(state: NavState, action: Action | SelectGame): NavState {
  if (typeof action === "object") return { ...state, screen: "hub", game: action.index, item: 0 };
  return navigate(state, action);
}

function presentationState(state: HubState): HubState {
  return { ...state, games: state.games.map(game => game.installed ? game : { ...game, assetUrls: {} }) };
}

export default function HubProvider() {
  const [hubState, setHubState] = useState<HubState | null>(null);
  const [preparedState, setPreparedState] = useState<HubState | null>(null);
  const [startedState, setStartedState] = useState<HubState | null>(null);
  const [musicAttempt, setMusicAttempt] = useState(0);
  const [preparationError, setStartupError] = useState("");
  const [startupItem, setStartupItem] = useState(0);
  const startupButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const settingsCache = useGameSettingsCache();
  const [nav, rawDispatch] = useReducer(reduceNav, INITIAL_NAV);
  const [quitOpen, setQuitOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDetail, setSettingsDetail] = useState(false);
  const settingsOpenRef = useRef(false);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
  const pendingNavigation = useRef<Action | SelectGame | null>(null);
  const settingsActionRef = useRef<((action: Action) => void) | null>(null);
  const [quitItem, setQuitItem] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [firstRunItem, setFirstRunItem] = useState(0);
  const [extractingAll, setExtractingAll] = useState(false);
  const [progress, setProgress] = useState<Record<string, ExtractProgress>>({});
  const [volume, setVolume] = useState(0.6);
  const [musicSelections, setMusicSelections] = useState<MenuMusicSelections>({});
  const [configLoaded, setConfigLoaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // The "Launching..." overlay (and the dimmed screen behind it) was otherwise only cleared by
  // its own LAUNCH_MESSAGE_MS timeout, so navigating away - picking a different game, opening
  // Game Selection, switching games with left/right - while it still showed left it stuck over
  // every screen after, regardless of which game triggered it. Clearing it here, ahead of every
  // nav dispatch, means it never survives past the input that moved on from it.
  function dispatch(action: Action | SelectGame): void {
    setLaunching(false);
    rawDispatch(action);
  }

  useEffect(() => {
    let cancelled = false;
    void window.hub.getState().then((r) => {
      if (cancelled) return;
      if (!r.ok) { setStartupError(r.error); return; }
      setHubState(presentationState(r.value));
      if (r.value.startGame) {
        const index = PACK_ORDER.indexOf(r.value.startGame);
        if (index >= 0) dispatch({ type: "selectGame", index });
      }
    }).catch(error => { if (!cancelled) setStartupError(String(error)); });
    void window.hub.getConfig().then((r) => {
      if (cancelled) return;
      if (!r.ok) { setStartupError(r.error); return; }
      setVolume(r.value.volume);
      setMusicSelections(r.value.menuMusic ?? {});
      setConfigLoaded(true);
    }).catch(error => { if (!cancelled) setStartupError(String(error)); });
    void window.hub.getUpdate().then((r) => {
      if (!cancelled && r.ok && r.value) setUpdateInfo(r.value);
    });
    const offSelectGame = window.hub.onSelectGame((id) => {
      if (cancelled) return;
      const index = PACK_ORDER.indexOf(id);
      if (index >= 0) {
        const action: SelectGame = { type: "selectGame", index };
        if (settingsOpenRef.current) pendingNavigation.current = action;
        else dispatch(action);
      }
    });
    const offSelectionOpen = window.hub.onSelectionOpen(() => {
      if (!cancelled) {
        if (settingsOpenRef.current) pendingNavigation.current = "menu";
        else dispatch("menu");
      }
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
      offSelectionOpen();
      off();
    };
  }, []);

  const games = hubState?.games ?? [];
  const currentGame: GameState | undefined = games[nav.game];
  const needsFirstRun = Boolean(hubState && !hubState.steamPath) || games.some((g) => g.installed && (!g.assets || g.stale));
  const ready = Boolean(hubState && preparedState === hubState && startedState === hubState);
  const musicUrl = configLoaded && !needsFirstRun && currentGame
    ? resolveMenuMusic(currentGame.pack.id, currentGame.assetUrls, musicSelections[currentGame.pack.id]) : undefined;
  const music = useMenuMusic(musicUrl, volume, musicAttempt);
  const startupError = preparationError || (!ready ? music.error : "");
  // Keep a completed startup latched while later tracks buffer or fail. This conditional
  // state adjustment finishes before React commits the newly visible menu.
  if (hubState && preparedState === hubState && music.ready && startedState !== hubState) setStartedState(hubState);
  const startupRowCount = games.some(game => game.installed) ? 2 : 1;

  useEffect(() => {
    if (startupError) startupButtons.current[Math.min(startupItem, startupRowCount - 1)]?.focus();
  }, [startupError, startupItem, startupRowCount]);

  useEffect(() => {
    if (!hubState || needsFirstRun || !configLoaded) return;
    let cancelled = false;
    void Promise.all([
      settingsCache.preload(hubState.games.filter(game => game.installed).map(game => game.pack.id)),
      preloadPresentation(hubState.games),
    ]).then(() => {
      if (cancelled) return;
      setPreparedState(hubState);
    }).catch(error => { if (!cancelled) setStartupError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [hubState, needsFirstRun, settingsCache, configLoaded]);

  useEffect(() => { if (ready) void window.hub.ready(); }, [ready]);

  // Remembers the current game so the next launch with no `--game` argument opens on it.
  useEffect(() => {
    const id = currentGame?.pack.id;
    if (!id) return;
    void window.hub.setConfig({ lastGame: id });
  }, [currentGame?.pack.id]);

  // Theme: the current game's colours become CSS custom properties on <html>.
  useEffect(() => {
    if (!currentGame) return;
    const vars = themeVars(currentGame.pack.theme);
    for (const [key, value] of Object.entries(vars)) document.documentElement.style.setProperty(key, value);
  }, [currentGame]);

  // Y (gamepad button 3, matching the footer's "press Y" copy) and the Y key open the
  // update's release page while the footer banner is showing. Mirrors GameScreen's own
  // Y/retry effect (same button, same polling shape) since both are global "press Y for the
  // thing the footer/overlay is telling you about" affordances rather than menu navigation.
  useEffect(() => {
    if (!updateInfo || settingsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyY") void window.hub.openUpdate();
    };
    window.addEventListener("keydown", onKeyDown);

    const wasDown = new Array<boolean>(MAX_PADS).fill(false);
    let frame = 0;
    const poll = () => {
      const pads = navigator.getGamepads();
      for (let i = 0; i < MAX_PADS; i++) {
        const down = Boolean(pads[i]?.buttons[3]?.pressed);
        if (down && !wasDown[i]) void window.hub.openUpdate();
        wasDown[i] = down;
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [updateInfo, settingsOpen]);

  async function refreshState(): Promise<void> {
    try {
      const [r, config] = await Promise.all([window.hub.getState(), window.hub.getConfig()]);
      if (!config.ok) { setStartupError(config.error); return; }
      if (r.ok) {
        setStartupError("");
        setVolume(config.value.volume);
        setMusicSelections(config.value.menuMusic ?? {});
        setConfigLoaded(true);
        setMusicAttempt(attempt => attempt + 1);
        for (const game of r.value.games) settingsCache.invalidate(game.pack.id);
        setHubState(presentationState(r.value));
      } else setStartupError(r.error);
    } catch (error) { setStartupError(error instanceof Error ? error.message : String(error)); }
  }

  function recoverStartup(index: number): void {
    setStartupError("");
    setStartupItem(0);
    if (index === 0) void refreshState();
    else {
      setFirstRunItem(0);
      setProgress({});
      setHubState(state => state && { ...state, games: state.games.map(game => game.installed ? { ...game, stale: true } : game) });
    }
  }

  async function handleMenuChoice(key: MenuKey): Promise<void> {
    if (!currentGame) return;
    if (key === "start") {
      setLaunching(true);
      await window.hub.launch(currentGame.pack.id);
      window.setTimeout(() => setLaunching(false), LAUNCH_MESSAGE_MS);
    } else if (key === "gameSelection") {
      dispatch("menu");
    } else if (key === "options") {
      setSettingsDetail(false);
      setSettingsOpen(true);
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
    if (r.ok) {
      for (const game of r.value.games) settingsCache.invalidate(game.pack.id);
      setHubState(presentationState(r.value));
    }
  }

  function firstRunRows(): { onSelect: () => void }[] {
    const rows: { onSelect: () => void }[] = [];
    if (!hubState?.steamPath) rows.push({ onSelect: () => void handlePickFolder() });
    rows.push({ onSelect: () => void handleStartExtraction() });
    return rows;
  }

  const onAction = (action: Action) => {
    if (startupError || (!ready && !needsFirstRun)) {
      if (startupError) {
        if (action === "up" || action === "down") setStartupItem(index => (index + (action === "up" ? startupRowCount - 1 : 1)) % startupRowCount);
        else if (action === "confirm") recoverStartup(Math.min(startupItem, startupRowCount - 1));
      }
      return;
    }
    if (settingsOpen) {
      settingsActionRef.current?.(action);
      return;
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

  // `lastInputKind` (Task 14) is threaded down to `GameScreen`'s footer hints - `useNavigation`
  // must stay a single call site (it owns the keydown/gamepad listeners), so this is the only
  // place a consumer can read it.
  const { lastInputKind } = useNavigation(onAction);

  const updateBanner = updateInfo && (
    <div
      data-testid="update-banner"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
        background: "rgba(0,0,0,0.85)", color: "#fff",
        padding: "0.5rem 1rem", fontSize: "1rem", textAlign: "center",
      }}
    >
      Update v{updateInfo.version} available, press Y to open
    </div>
  );

  if (!hubState || startupError || (!needsFirstRun && !ready)) return <div className="startup-screen" data-testid="startup-screen">
    <p role="status">{startupError || "Loading…"}</p>
    {startupError && ["Retry", ...(startupRowCount > 1 ? ["Re-extract Artwork"] : [])].map((label, index) => <button key={label}
      ref={button => { startupButtons.current[index] = button; }} className={startupItem === index ? "focused" : undefined}
      onFocus={() => setStartupItem(index)} onMouseEnter={() => setStartupItem(index)} onClick={() => recoverStartup(index)}>{label}</button>)}
  </div>;

  if (needsFirstRun) {
    return (
      <>
        <FirstRun
          games={games}
          steamPath={hubState.steamPath}
          progress={progress}
          focusIndex={firstRunItem}
          extracting={extractingAll}
          onPickFolder={() => void handlePickFolder()}
          onStart={() => void handleStartExtraction()}
        />
        {updateBanner}
      </>
    );
  }

  if (!currentGame) return <div className="screen-root" />;

  // The backdrop has one stable mount. Navigation replaces only the foreground menus.
  const displayedGame = nav.screen === "selection" ? (games[nav.item] ?? currentGame) : currentGame;

  return (
    <>
      <div style={{ position: "absolute", inset: 0 }}>
        <PersistentBackdrop game={displayedGame} view={settingsOpen ? "settings" : nav.screen === "selection" ? "selection" : "main"} detail={settingsDetail} />
        {settingsOpen ? (
          <SettingsScreen game={currentGame} actionRef={settingsActionRef} lastInputKind={lastInputKind} settingsCache={settingsCache} onDetailChange={setSettingsDetail}
            musicSelection={musicSelections[currentGame.pack.id]} onMusicSaved={setMusicSelections}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsDetail(false);
              if (pendingNavigation.current) {
                dispatch(pendingNavigation.current);
                pendingNavigation.current = null;
              }
            }} />
        ) : nav.screen === "selection" ? (
          <GameSelection
            games={games}
            focusIndex={nav.item}
            lastInputKind={lastInputKind}
            onSelect={(index) => dispatch({ type: "selectGame", index })}
          />
        ) : currentGame.installed ? (
          <GameScreen
            game={currentGame}
            menuItem={nav.item}
            launching={launching}
            quitOpen={quitOpen}
            quitItem={quitItem}
            lastInputKind={lastInputKind}
            onSelectMenuItem={(index) => void handleMenuChoice(currentGame.pack.menu[index] ?? "start")}
            onQuitSelect={handleQuitChoice}
            onRetryExtract={() => void handleRetryExtract()}
          />
        ) : (
          <NotInstalled game={currentGame} onInstall={() => void window.hub.launch(currentGame.pack.id, { install: true })} />
        )}
      </div>
      {updateBanner}
    </>
  );
}
