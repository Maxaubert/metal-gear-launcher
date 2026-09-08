import { useState } from "react";
import { GameSettingsCache } from "./gameSettingsCache";

export function useGameSettingsCache(): GameSettingsCache {
  const [cache] = useState(() => new GameSettingsCache((gameId, accountId) => window.hub.getGameSettings(gameId, accountId)));
  return cache;
}
