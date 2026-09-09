import type { BonusPresentation } from "@shared/bonus";
import { bonusArtwork } from "./artwork";
import { BonusCache } from "./cache";
import { discoverBonus } from "./discovery";

/** Selection needs only the main artwork, not every soundtrack sleeve. */
export async function getBonusPresentation(steamPath: string | null, dataDir: string): Promise<BonusPresentation> {
  for (const install of await discoverBonus(steamPath)) {
    try {
      return { volume: install.id, artwork: await bonusArtwork(await BonusCache.open(install, dataDir)) };
    } catch { /* Another installed volume or the neutral bonus scene remains available. */ }
  }
  return { volume: null, artwork: {} };
}
