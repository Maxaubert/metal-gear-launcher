import type { AssetRole, Pack } from "./packs";
import type { Config } from "../electron/main/config";
import type { AssetManifest, Progress } from "../electron/main/extract/extractor";
import type { GameId } from "../electron/main/cli";
import type { UpdateInfo } from "../electron/main/update";
import type { GameSettings, SaveSettingsRequest } from "./settings";
import type { MenuMusicLibrary, MenuMusicRequest } from "./menuMusic";
import type { MenuSoundData } from "./menuSounds";
import type { AchievementsRequest, AchievementsSnapshot } from "./achievements";

export const ASSET_PROTOCOL = "hub-asset";

export type { AssetManifest, Config, GameId, Progress, UpdateInfo };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type GameState = {
  pack: Pack;
  installed: boolean;
  installDir?: string;
  // Steam's build id for the currently installed copy - not in the original interface sketch,
  // but `hub:extract` needs it (see index.ts) to build the `Install` the extractor takes, and
  // the renderer needs it to know whether a re-extract is worth offering.
  buildId?: string;
  assets?: AssetManifest;
  assetUrls: Partial<Record<AssetRole, string>>;
  // True when `assets` is missing or extract/extract/extractor.isStale() says the cached
  // manifest no longer matches the installed build or bundled tool versions.
  stale: boolean;
};

export type HubState = {
  steamPath: string | null;
  games: GameState[];
  // The game to show on first render: the `--game` CLI argument if one was given, else the
  // last successfully launched game, legacy lastGame, then the first game.
  startGame?: GameId;
};

export type ExtractTarget = "all" | Pack["id"];

export interface HubApi {
  getAchievements(request: AchievementsRequest): Promise<Result<AchievementsSnapshot>>;
  getMenuSounds(): Promise<Result<MenuSoundData>>;
  getGameSettings(gameId: GameId, accountId?: string): Promise<Result<GameSettings>>;
  saveGameSettings(request: SaveSettingsRequest): Promise<Result<GameSettings>>;
  saveMenuMusic(request: MenuMusicRequest): Promise<Result<Config>>;
  getMenuMusic(gameId: GameId): Promise<Result<MenuMusicLibrary>>;
  openMenuMusicFolder(gameId: GameId): Promise<Result<void>>;
  getState(): Promise<Result<HubState>>;
  extract(target: ExtractTarget): Promise<Result<HubState>>;
  onExtractProgress(cb: (p: Progress) => void): () => void;
  // Pushed by main when a second app instance was launched with `--game <id>` while this one
  // already owns the single-instance lock; the renderer switches to that game in place.
  onSelectGame(cb: (id: GameId) => void): () => void;
  setSteamPath(path: string): Promise<Result<HubState>>;
  // Added by Task 9, which needed it for `HubProvider.tsx` and `NotInstalled.tsx` (both in
  // that task's own file list) to compile, even though `shared/ipc.ts` itself is not listed
  // under Task 9's Modify files. `opts.install` is forwarded to the main-process handler so an
  // uninstalled game's "Install on Steam" row can ask it to open `steam://install/<appId>`
  // instead of launching the game exe; the handler itself is still Task 10's stub until then.
  // This is not a guess at Task 10's shape: the plan's own Task 10 section already specifies
  // "`hub:launch` payload `{ gameId, install?: boolean }`" verbatim
  // (docs/superpowers/plans/2026-09-06-mvp-hub.md:1224, written before either task ran), so this
  // addition is that same pre-existing spec, not a unilateral redefinition of a shared contract.
  // Task 10 builds its `hub:launch` handler on this exact `opts` shape.
  launch(gameId: string, opts?: { install?: boolean }): Promise<Result<void>>;
  quit(): Promise<Result<void>>;
  // The result of the one-time boot check against GitHub Releases (electron/main/update.ts).
  // `null` means either the check failed (best-effort, ignored) or the hub is already current.
  getUpdate(): Promise<Result<UpdateInfo | null>>;
  // Opens the release page for the update `getUpdate` reported, in the system browser.
  openUpdate(): Promise<Result<void>>;
  getConfig(): Promise<Result<Config>>;
  setConfig(patch: Partial<Omit<Config, "menuMusic" | "lastLaunchedGame">>): Promise<Result<Config>>;
  pickFolder(): Promise<Result<string>>;
  // Task 14's `HUB_SHOOT` real-asset screenshot mode: the renderer calls this once packs and
  // asset state have loaded, so main knows it is safe to start driving the game-by-game
  // screenshot sequence (main is otherwise blind to renderer readiness).
  ready(): Promise<Result<void>>;
  // Pushed by main (shoot mode only) once every game has been screenshotted, asking the
  // renderer to open Game Selection so its own screenshot can be taken.
  onSelectionOpen(cb: () => void): () => void;
}
