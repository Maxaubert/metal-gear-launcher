import type { GameId } from "@shared/ipc";
import { loadPacks } from "@shared/packs";
import { readConfig } from "../config";
import { findSteamRoot, listLibraries } from "../steam/library";
import { resolveInstall } from "../steam/resolve";
import { getGameSettings } from "./service";

/** Settings need one live installation, not a full artwork/extraction state rebuild. */
export async function getInstalledGameSettings(gameId: GameId, accountId?: string) {
  const steamRoot = await findSteamRoot((await readConfig()).steamPath);
  const pack = loadPacks().find(pack => pack.id === gameId);
  const install = steamRoot && pack ? await resolveInstall(pack, await listLibraries(steamRoot)) : null;
  if (!install || !steamRoot) throw new Error("This game is not installed.");
  return getGameSettings(gameId, install.installDir, accountId, steamRoot);
}
