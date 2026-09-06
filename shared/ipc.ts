import type { AssetRole, Pack } from "./packs";
import type { Config } from "../electron/main/config";
import type { AssetManifest, Progress } from "../electron/main/extract/extractor";

export const ASSET_PROTOCOL = "hub-asset";

export type { AssetManifest, Config, Progress };

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

export type HubState = { steamPath: string | null; games: GameState[] };

export type ExtractTarget = "all" | Pack["id"];

export interface HubApi {
  getState(): Promise<Result<HubState>>;
  extract(target: ExtractTarget): Promise<Result<HubState>>;
  onExtractProgress(cb: (p: Progress) => void): () => void;
  setSteamPath(path: string): Promise<Result<HubState>>;
  launch(gameId: string): Promise<Result<void>>;
  quit(): Promise<Result<void>>;
  getConfig(): Promise<Result<Config>>;
  setConfig(patch: Partial<Config>): Promise<Result<Config>>;
  pickFolder(): Promise<Result<string>>;
}
