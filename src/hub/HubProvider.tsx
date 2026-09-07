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

const INITIAL_NAV: NavState = { screen: "hub", game: 0, item: 0, menuLength: 3, gameCount: PACK_ORDER.length };
const LAUNCH_MESSAGE_MS = 3000;
const FONT_STYLE_ID = "hub-font-face";
const MAX_PADS = 4;

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
  const [nav, rawDispatch] = useReducer(reduceNav, INITIAL_NAV);
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitItem, setQuitItem] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [firstRunItem, setFirstRunItem] = useState(0);
  const [extractingAll, setExtractingAll] = useState(false);
  const [progress, setProgress] = useState<Record<string, ExtractProgress>>({});
  const [volume, setVolume] = useState(0.6);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const hasActedRef = useRef(false);

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
      if (cancelled || !r.ok) return;
      setHubState(r.value);
      if (r.value.startGame) {
        const index = PACK_ORDER.indexOf(r.value.startGame);
        if (index >= 0) dispatch({ type: "selectGame", index });
      }
      // Tells main it is safe to start the HUB_SHOOT screenshot sequence, if one was
      // requested - packs and asset state are loaded, so a `hub:selectGame` push would land
      // on a fully rendered screen. A no-op outside shoot mode.
      void window.hub.ready();
    });
    void window.hub.getConfig().then((r) => {
      if (!cancelled && r.ok) setVolume(r.value.volume);
    });
    void window.hub.getUpdate().then((r) => {
      if (!cancelled && r.ok && r.value) setUpdateInfo(r.value);
    });
    const offSelectGame = window.hub.onSelectGame((id) => {
      if (cancelled) return;
      const index = PACK_ORDER.indexOf(id);
      if (index >= 0) dispatch({ type: "selectGame", index });
    });
    const offSelectionOpen = window.hub.onSelectionOpen(() => {
      if (!cancelled) dispatch("menu");
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
  const mgs3Game = games.find((g) => g.pack.id === "mgs3");
  const needsFirstRun = games.some((g) => g.installed && (!g.assets || g.stale));

  // Remembers the current game so the next launch with no `--game` argument opens on it.
  useEffect(() => {
    const id = currentGame?.pack.id;
    if (!id) return;
    void window.hub.setConfig({ lastGame: id });
  }, [currentGame?.pack.id]);

  const music = useMenuMusic(currentGame?.assetUrls.bgm, volume);

  // Font (D1): the current game's medium (400) and bold (700) weights, each falling back to
  // MGS3's own weight, falling back to the system font already declared in global.css when
  // neither has been extracted yet (MGS1 has no font asset at all, so it always falls back).
  // `font-display: block` avoids a visible swap-in flash once the CORS-unblocked font loads.
  useEffect(() => {
    const fontMediumUrl = currentGame?.assetUrls.fontMedium ?? mgs3Game?.assetUrls.fontMedium;
    const fontBoldUrl = currentGame?.assetUrls.fontBold ?? mgs3Game?.assetUrls.fontBold;
    let styleEl = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null;
    if (!fontMediumUrl && !fontBoldUrl) {
      styleEl?.remove();
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = FONT_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    const rules: string[] = [];
    if (fontMediumUrl) rules.push(`@font-face { font-family: "Rodin"; font-weight: 400; font-display: block; src: url("${fontMediumUrl}"); }`);
    if (fontBoldUrl) rules.push(`@font-face { font-family: "Rodin"; font-weight: 700; font-display: block; src: url("${fontBoldUrl}"); }`);
    styleEl.textContent = rules.join("\n");
  }, [currentGame?.assetUrls.fontMedium, currentGame?.assetUrls.fontBold, mgs3Game?.assetUrls.fontMedium, mgs3Game?.assetUrls.fontBold]);

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
    if (!updateInfo) return;
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
  }, [updateInfo]);

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

  if (!hubState) return <div className="screen-root" />;

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

  // Round 6: Game Selection is no longer a dark overlay stacked on top of a dimmed GameScreen -
  // it's the same light screen (`ScreenBackdrop` renders the focused entry's own art/header), so
  // the two are mutually exclusive here rather than both mounted. The crossfade key follows
  // whichever pack is actually on screen (the focused entry while browsing, the current game
  // otherwise) so switching games/entries and entering/leaving Game Selection all still crossfade.
  const displayedPackId = nav.screen === "selection" ? (games[nav.item]?.pack.id ?? currentGame.pack.id) : currentGame.pack.id;

  return (
    <>
      <div key={displayedPackId} className="game-fade" style={{ position: "absolute", inset: 0 }}>
        {nav.screen === "selection" ? (
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
