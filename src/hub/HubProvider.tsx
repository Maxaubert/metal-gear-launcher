import { useEffect, useReducer, useRef, useState } from "react";
import type { GameState, HubState, Progress, UpdateInfo } from "@shared/ipc";
import { PACK_ORDER } from "@shared/packs";
import { navigate, type Action, type NavState } from "../input/navigationReducer";
import { useNavigation } from "../input/useNavigation";
import { useMenuMusic } from "../audio/useMenuMusic";
import { menuSoundSourceKey, playMenuSound, preloadMenuSounds, setMenuSoundVolume } from "../audio/menuSounds";
import { themeVars } from "../theme/theme";
import GameScreen, { type MenuKey } from "../screens/GameScreen";
import QuitDialog from "../screens/QuitDialog";
import GameSelection from "../screens/GameSelection";
import FirstRun, { type ExtractProgress } from "../screens/FirstRun";
import NotInstalled from "../screens/NotInstalled";
import UnavailableDialog from "../screens/UnavailableDialog";
import SettingsScreen from "../settings/SettingsScreen";
import PersistentBackdrop from "../screens/PersistentBackdrop";
import { useGameSettingsCache } from "../settings/useGameSettingsCache";
import { preloadPresentation } from "./preloadPresentation";
import StartupSplash from "./StartupSplash";
import { useStartupPresentation } from "./useStartupPresentation";
import { resolveMenuMusic, type MenuMusicLibrary, type MenuMusicSelections } from "@shared/menuMusic";
import TrophiesScreen from "../achievements/TrophiesScreen";
import BonusContentScreen from "../bonus/BonusContentScreen";
import { useBonusResources } from "../bonus/useBonusResources";
import { useBonusPlaylist } from "../bonus/useBonusPlaylist";
import { useBooksCatalog } from "./useBooksCatalog";
import { useLibraryPreparation } from "./useLibraryPreparation";

const INITIAL_NAV: NavState = { screen: "hub", game: 0, item: 0, menuLength: 5, gameCount: PACK_ORDER.length + 1 };
const LAUNCH_MESSAGE_MS = 3000;
const MAX_PADS = 4;

// `navigate` (Task 8) only understands relative moves, so clicking a specific tile in
// `GameSelection` is handled as a local pseudo-action here rather than by extending its
// `Action` union.
type SelectGame = { type: "selectGame"; index: number };
type FocusItem = { type: "focusItem"; index: number };

function reduceNav(state: NavState, action: Action | SelectGame | FocusItem): NavState {
  if (typeof action === "object" && action.type === "focusItem") return { ...state, item: action.index };
  if (typeof action === "object") return { ...state, screen: "hub", game: action.index, item: 0 };
  return navigate(state, action);
}

function presentationState(state: HubState): HubState {
  return { ...state, games: state.games.map(game => game.installed ? game : { ...game, assetUrls: {} }) };
}

export default function HubProvider() {
  const [hubState, setHubState] = useState<HubState | null>(null);
  const libraryPreparation = useLibraryPreparation(hubState?.steamPath);
  useEffect(() => {
    if (libraryPreparation.hub) setHubState(presentationState(libraryPreparation.hub));
  }, [libraryPreparation.hub]);
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
  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [unavailable, setUnavailable] = useState<{ title: string; message: string } | null>(null);
  const showUnavailable = (title: string, message: string) => setUnavailable({ title, message });
  const closeUnavailable = () => { void playMenuSound("back"); setUnavailable(null); };
  const [bonusMusicSelected, setBonusMusicSelected] = useState(false);
  const { catalog: booksCatalog, preload: preloadBooks } = useBooksCatalog();
  function openBonus() { setBonusMusicSelected(true); setBonusOpen(true); }
  useEffect(() => {
    if (!bonusOpen && nav.screen !== "selection") setBonusMusicSelected(false);
  }, [bonusOpen, nav.screen]);
  const [bonusMediaOpen, setBonusMediaOpen] = useState(false);
  const { presentation: bonusPresentation, playlist: bonusPlaylist, preload: preloadBonus } = useBonusResources();
  const bonusActionRef = useRef<((action: Action) => void) | null>(null);
  const missingActionRef = useRef<((action: Action) => void) | null>(null);
  const trophiesActionRef = useRef<((action: Action) => void) | null>(null);
  const [settingsDetail, setSettingsDetail] = useState(false);
  const settingsOpenRef = useRef(false);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
  const pendingNavigation = useRef<Action | SelectGame | null>(null);
  const settingsActionRef = useRef<((action: Action) => void) | null>(null);
  const [quitItem, setQuitItem] = useState(0);
  const quitting = useRef(false);
  const [launching, setLaunching] = useState(false);
  const [firstRunItem, setFirstRunItem] = useState(0);
  const [extractingAll, setExtractingAll] = useState(false);
  const [progress, setProgress] = useState<Record<string, ExtractProgress>>({});
  const [volume, setVolume] = useState(0.6);
  const [musicSelections, setMusicSelections] = useState<MenuMusicSelections>({});
  const [musicLibraries, setMusicLibraries] = useState<Partial<Record<string, MenuMusicLibrary>>>({});
  const [musicPreview, setMusicPreview] = useState<string>();
  const [mutedStartupGame, setMutedStartupGame] = useState<string>();
  const [configLoaded, setConfigLoaded] = useState(false);
  const [soundsReadyKey, setSoundsReadyKey] = useState<string | null>(null);
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
  function userDispatch(action: Action | SelectGame): void {
    const next = reduceNav(nav, action);
    if (nav.screen === "selection" && (action === "confirm" || typeof action === "object") && next.screen === "hub") {
      const selected = hubState?.games[next.game];
      if (selected && !selected.installed) {
        document.querySelector<HTMLElement>(`[data-testid="tile-${selected.pack.id}"]`)?.focus();
        void playMenuSound("select");
        showUnavailable(selected.pack.title, "This game is not installed. Install it through Steam to play it.");
        return;
      }
    }
    if (next.screen !== nav.screen || next.game !== nav.game) void playMenuSound(action === "back" || action === "menu" && nav.screen === "selection" ? "back" : "select");
    else if (next.item !== nav.item) void playMenuSound("navigate");
    dispatch(action);
  }
  function focusQuit(index: number): void {
    if (index === quitItem) return;
    void playMenuSound("navigate");
    setQuitItem(index);
  }
  function focusFirstRun(index: number): void {
    if (index === firstRunItem) return;
    void playMenuSound("navigate");
    setFirstRunItem(index);
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
        else { setBonusOpen(false); setTrophiesOpen(false); dispatch(action); }
      }
    });
    const offSelectionOpen = window.hub.onSelectionOpen(() => {
      if (!cancelled) {
        if (settingsOpenRef.current) pendingNavigation.current = "menu";
        else { setBonusOpen(false); setTrophiesOpen(false); dispatch("menu"); }
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
  const bonusFocused = nav.screen === "selection" && nav.item === PACK_ORDER.length;
  const bonusActive = bonusOpen || bonusFocused;
  const bonusAudioActive = bonusOpen || (nav.screen === "selection" && bonusMusicSelected);
  const musicUrl = configLoaded && !needsFirstRun && currentGame && musicLibraries[currentGame.pack.id]
    ? musicPreview ?? (mutedStartupGame === currentGame.pack.id ? undefined : resolveMenuMusic(currentGame.pack.id, currentGame.assetUrls, musicSelections[currentGame.pack.id], musicLibraries[currentGame.pack.id])) : undefined;
  const musicGain = currentGame ? musicLibraries[currentGame.pack.id]?.themes.find(theme => theme.url === musicUrl)?.normalizationGain : undefined;
  const music = useMenuMusic(musicUrl, volume, musicAttempt, Boolean(musicPreview), bonusAudioActive, musicGain);
  const soundSourceKey = hubState ? menuSoundSourceKey(hubState) : null;
  const soundsReady = soundSourceKey !== null && soundsReadyKey === soundSourceKey;
  useEffect(() => { setMenuSoundVolume(volume); }, [volume]);
  useEffect(() => {
    if (!configLoaded || soundSourceKey === null) return;
    let cancelled = false;
    void preloadMenuSounds(soundSourceKey).then(() => { if (!cancelled) setSoundsReadyKey(soundSourceKey); });
    return () => { cancelled = true; };
  }, [configLoaded, soundSourceKey]);
  const startupError = libraryPreparation.error || preparationError || (!ready ? music.error : "");
  const canReveal = Boolean(hubState && libraryPreparation.ready && !startupError && soundsReady && (needsFirstRun || ready));
  const startup = useStartupPresentation(canReveal);
  useBonusPlaylist({ playlist: bonusPlaylist, active: bonusAudioActive, suspended: bonusMediaOpen || startup.visible, volume });
  // Keep a completed startup latched while later tracks buffer or fail. This conditional
  // state adjustment finishes before React commits the newly visible menu.
  if (hubState && preparedState === hubState && music.ready && startedState !== hubState) setStartedState(hubState);
  const startupActions = libraryPreparation.error ? ["Retry preparation"] : ["Retry", ...(games.some(game => game.installed) ? ["Re-extract Artwork"] : []), ...(music.error ? ["Continue Without Music"] : [])];
  const startupRowCount = startupActions.length;

  useEffect(() => {
    if (startupError) startupButtons.current[Math.min(startupItem, startupRowCount - 1)]?.focus();
  }, [startupError, startupItem, startupRowCount]);

  useEffect(() => {
    if (!hubState || needsFirstRun || !configLoaded || !libraryPreparation.ready) return;
    let cancelled = false;
    void Promise.all([
      settingsCache.preload(hubState.games.filter(game => game.installed).map(game => game.pack.id)),
      preloadPresentation(hubState.games),
      preloadMenuSounds(menuSoundSourceKey(hubState)),
      preloadBonus(),
      preloadBooks(),
      Promise.all(hubState.games.map(async game => {
        const result = await window.hub.getMenuMusic(game.pack.id);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      })).then(libraries => {
        if (!cancelled) setMusicLibraries(Object.fromEntries(libraries.map(library => [library.gameId, library])));
      }),
    ]).then(() => {
      if (cancelled) return;
      setPreparedState(hubState);
    }).catch(error => { if (!cancelled) setStartupError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [hubState, needsFirstRun, settingsCache, configLoaded, preloadBonus, preloadBooks, libraryPreparation.ready]);

  useEffect(() => { if (ready && !startup.visible) void window.hub.ready(); }, [ready, startup.visible]);

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
    if (!updateInfo || settingsOpen || trophiesOpen || bonusOpen || startup.visible || unavailable) return;
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
  }, [updateInfo, settingsOpen, trophiesOpen, bonusOpen, startup.visible, unavailable]);

  async function refreshState(): Promise<void> {
    try {
      const [r, config] = await Promise.all([window.hub.getState(), window.hub.getConfig()]);
      if (!config.ok) { setStartupError(config.error); return; }
      if (r.ok) {
        setStartupError("");
        setVolume(config.value.volume);
        setMusicSelections(config.value.menuMusic ?? {});
        setMutedStartupGame(undefined);
        setConfigLoaded(true);
        setMusicAttempt(attempt => attempt + 1);
        for (const game of r.value.games) settingsCache.invalidate(game.pack.id);
        setHubState(presentationState(r.value));
      } else setStartupError(r.error);
    } catch (error) { setStartupError(error instanceof Error ? error.message : String(error)); }
  }

  function recoverStartup(index: number): void {
    if (libraryPreparation.error) { libraryPreparation.retry(); return; }
    setStartupError("");
    setStartupItem(0);
    if (index === 0) void refreshState();
    else if (startupActions[index] === "Continue Without Music") setMutedStartupGame(currentGame?.pack.id);
    else {
      setFirstRunItem(0);
      setProgress({});
      setHubState(state => state && { ...state, games: state.games.map(game => game.installed ? { ...game, stale: true } : game) });
    }
  }

  async function handleMenuChoice(key: MenuKey): Promise<void> {
    if (!currentGame) return;
    if (key === "start") {
      void playMenuSound("start");
      setLaunching(true);
      await window.hub.launch(currentGame.pack.id);
      window.setTimeout(() => setLaunching(false), LAUNCH_MESSAGE_MS);
    } else if (key === "gameSelection") {
      userDispatch("menu");
    } else if (key === "options") {
      void playMenuSound("options");
      setSettingsDetail(false);
      setSettingsOpen(true);
    } else if (key === "trophies") {
      void playMenuSound("select");
      setTrophiesOpen(true);
    } else {
      void playMenuSound("select");
      setQuitItem(0);
      setQuitOpen(true);
    }
  }

  async function handleQuitChoice(index: number): Promise<void> {
    if (quitting.current) return;
    if (index === 0) {
      quitting.current = true;
      try {
        await playMenuSound("back");
        await window.hub.quit();
      } finally { quitting.current = false; }
    } else {
      void playMenuSound("back");
      setQuitOpen(false);
    }
  }

  async function handleRetryExtract(): Promise<void> {
    if (!currentGame || startup.visible) return;
    await window.hub.extract(currentGame.pack.id);
    await refreshState();
  }

  async function handleStartExtraction(): Promise<void> {
    void playMenuSound("select");
    setExtractingAll(true);
    await window.hub.extract("all");
    setExtractingAll(false);
    await refreshState();
  }

  async function handlePickFolder(): Promise<void> {
    void playMenuSound("select");
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
    if (quitting.current) return;
    if (unavailable) {
      if (action === "confirm" || action === "back") closeUnavailable();
      return;
    }
    if (startup.visible) {
      if (startupError) {
        if (action === "up" || action === "down") setStartupItem(index => (index + (action === "up" ? startupRowCount - 1 : 1)) % startupRowCount);
        else if (action === "confirm") recoverStartup(Math.min(startupItem, startupRowCount - 1));
      }
      return;
    }
    if (quitOpen) {
      if (action === "up" || action === "down") focusQuit(quitItem === 0 ? 1 : 0);
      else if (action === "confirm") void handleQuitChoice(quitItem);
      else if (action === "back") void handleQuitChoice(1);
      return;
    }
    if (bonusOpen) {
      bonusActionRef.current?.(action);
      return;
    }
    if (nav.screen === "selection" && nav.item === PACK_ORDER.length && action === "confirm") {
      void playMenuSound("select");
      openBonus();
      return;
    }
    if (settingsOpen) {
      settingsActionRef.current?.(action);
      return;
    }
    if (trophiesOpen) {
      trophiesActionRef.current?.(action);
      return;
    }
    if (needsFirstRun) {
      const rows = firstRunRows();
      if (action === "up" || action === "down") {
        focusFirstRun((firstRunItem + (action === "up" ? rows.length - 1 : 1)) % rows.length);
      } else if (action === "confirm") {
        rows[firstRunItem]?.onSelect();
      }
      return;
    }

    if (nav.screen === "hub") {
      if (currentGame && !currentGame.installed) {
        missingActionRef.current?.(action);
        return;
      }
      if (action === "confirm" && currentGame) {
        void handleMenuChoice(currentGame.pack.menu[nav.item] ?? "start");
        return;
      }
      if (action === "back") {
        void playMenuSound("back");
        setQuitItem(0);
        setQuitOpen(true);
        return;
      }
    }

    userDispatch(action);
  };

  // `lastInputKind` (Task 14) is threaded down to `GameScreen`'s footer hints - `useNavigation`
  // must stay a single call site (it owns the keydown/gamepad listeners), so this is the only
  // place a consumer can read it.
  const { lastInputKind, focusByMouse } = useNavigation(onAction);
  const hoverItem = (index: number) => {
    if (unavailable) return;
    focusByMouse(index);
    if (index === nav.item) return;
    void playMenuSound("navigate");
    rawDispatch({ type: "focusItem", index });
  };

  const updateBanner = updateInfo && !settingsOpen && !trophiesOpen && !bonusOpen && (
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

  let content;
  if (needsFirstRun && hubState && soundsReady) {
    content = (
      <>
        <FirstRun
          games={games}
          steamPath={hubState.steamPath}
          progress={progress}
          focusIndex={firstRunItem}
          onFocusItem={index => { focusByMouse(index); focusFirstRun(index); }}
          extracting={extractingAll}
          onPickFolder={() => void handlePickFolder()}
          onStart={() => void handleStartExtraction()}
        />
        {updateBanner}
      </>
    );
  } else if (currentGame && ready) {
    // The backdrop has one stable mount. Navigation replaces only the foreground menus.
    const displayedGame = nav.screen === "selection" ? (games[nav.item] ?? currentGame) : currentGame;

    content = (
      <>
        <div style={{ position: "absolute", inset: 0 }}>
          <div hidden={!displayedGame.installed && !bonusActive}>
            <PersistentBackdrop scene={bonusActive ? { kind: "bonus", presentation: bonusPresentation } : { kind: "game", game: displayedGame }} view={settingsOpen || trophiesOpen ? "settings" : nav.screen === "selection" ? "selection" : "main"} detail={settingsDetail || trophiesOpen} />
          </div>
          {bonusOpen ? <><div inert={quitOpen}>
            <BonusContentScreen actionRef={bonusActionRef} lastInputKind={lastInputKind} volume={volume}
            onQuit={() => { setQuitItem(0); setQuitOpen(true); }}
            onUnavailable={showUnavailable}
            booksCatalog={booksCatalog} onRefreshBooks={preloadBooks}
            presentation={bonusPresentation} onPlaybackViewChange={setBonusMediaOpen}
            onClose={() => setBonusOpen(false)} />
            </div>
            {quitOpen && <div style={themeVars(currentGame.pack.theme)}>
              <QuitDialog quitItem={quitItem} onQuitSelect={index => void handleQuitChoice(index)}
                onHoverQuitItem={index => { focusByMouse(index); focusQuit(index); }} />
            </div>}
          </> : trophiesOpen ? <TrophiesScreen key={currentGame.pack.id} game={currentGame} lastInputKind={lastInputKind}
            actionRef={trophiesActionRef} onClose={() => setTrophiesOpen(false)} /> : settingsOpen ? (
            <SettingsScreen game={currentGame} actionRef={settingsActionRef} lastInputKind={lastInputKind} settingsCache={settingsCache} onDetailChange={setSettingsDetail}
              musicSelection={musicSelections[currentGame.pack.id]} onMusicSaved={selections => { setMusicSelections(selections); setMutedStartupGame(undefined); }}
              musicLibrary={musicLibraries[currentGame.pack.id]!} onMusicPreview={setMusicPreview}
              musicError={music.error}
              onMusicLibraryChanged={library => setMusicLibraries(previous => ({ ...previous, [library.gameId]: library }))}
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
              bonusPresentation={bonusPresentation}
              focusIndex={nav.item}
              onFocusItem={hoverItem}
              lastInputKind={lastInputKind}
              onSelect={(index) => {
                if (index === games.length) { rawDispatch({ type: "focusItem", index }); void playMenuSound("select"); openBonus(); }
                else userDispatch({ type: "selectGame", index });
              }}
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
              onHoverMenuItem={hoverItem}
              onHoverQuitItem={index => { focusByMouse(index); focusQuit(index); }}
              onQuitSelect={index => void handleQuitChoice(index)}
              onRetryExtract={() => void handleRetryExtract()}
            />
          ) : (
            <NotInstalled game={currentGame} installedCount={games.filter(game => game.installed).length}
              actionRef={missingActionRef} lastInputKind={lastInputKind}
              onGameSelection={() => userDispatch("menu")}
              onLocateSteam={() => void handlePickFolder()}
              onQuit={() => void handleQuitChoice(0)}
              onInstall={() => { void playMenuSound("select"); void window.hub.launch(currentGame.pack.id, { install: true }); }} />
          )}
        </div>
        {updateBanner}
      </>
    );
  }

  return <>
    <div data-testid="hub-content" inert={startup.visible} aria-hidden={startup.visible || undefined}>
      {content}
    </div>
    {unavailable && <UnavailableDialog {...unavailable} onClose={closeUnavailable} />}
    {startup.visible && <StartupSplash error={startupError} actions={startupActions} selectedAction={startupItem}
      preparation={libraryPreparation.progress}
      exiting={startup.exiting} progress={startup.progress} buttonRefs={startupButtons} onFocusAction={setStartupItem} onRecover={recoverStartup} />}
  </>;
}
