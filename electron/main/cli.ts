import { PACK_ORDER, type Pack } from "@shared/packs";

export type GameId = Pack["id"];

const GAME_IDS: readonly string[] = PACK_ORDER;

export function isGameId(id: string): id is GameId {
  return GAME_IDS.includes(id);
}

/** Browsing tabs does not replace the last game the user actually launched. */
export function startGameFor(argv: string[], config: { lastLaunchedGame?: string; lastGame?: string }): GameId | undefined {
  return parseCliGame(argv)
    ?? (config.lastLaunchedGame && isGameId(config.lastLaunchedGame) ? config.lastLaunchedGame : undefined)
    ?? (config.lastGame && isGameId(config.lastGame) ? config.lastGame : undefined);
}

/** Reads a `--game <id>` or `--game=<id>` argument out of `argv`. Returns null when the flag
 * is absent or names something other than a recognised game pack id. */
export function parseCliGame(argv: string[]): GameId | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--game") {
      const value = argv[i + 1];
      return value !== undefined && isGameId(value) ? value : null;
    }
    if (arg?.startsWith("--game=")) {
      const value = arg.slice("--game=".length);
      return isGameId(value) ? value : null;
    }
  }
  return null;
}
