import { z } from "zod";
import { BonusCache } from "../bonus/cache";
import { bonusArtwork, bonusSleeve } from "../bonus/artwork";
import type { BonusInstall } from "../bonus/discovery";
import type { PreparationTask } from "./types";
import type { PreparationFailure } from "@shared/preparation";

export async function planBonus(installs: BonusInstall[], dataDir: string): Promise<{ tasks: PreparationTask[]; failures: PreparationFailure[] }> {
  const tasks: PreparationTask[] = []; const failures: PreparationFailure[] = [];
  for (const install of installs) {
    const label = `Bonus Content ${install.id === "vol1" ? "Vol. 1" : "Vol. 2"}`;
    try {
      const cache = await BonusCache.open(install, dataDir);
      const data = (await cache.decode("system/config/top_submenu_stream.psb.m")).json;
      const { param } = z.object({ param: z.object({ layout: z.array(z.string()).max(128) }).passthrough() }).parse(data);
      if (install.id === "vol1") await cache.decode("system/config/top_submenu_movie_title.psb.m");
      tasks.push({ id: `bonus:${install.id}:artwork`, label: `${label}: menu artwork`, run: async () => { await bonusArtwork(cache); } });
      for (let index = 0; index < param.layout.length; index++) tasks.push({ id: `bonus:${install.id}:sleeve:${index}`, label: `${label}: soundtrack cover ${index + 1}`, run: async () => { await bonusSleeve(cache, index); } });
    } catch (error) { failures.push({ id: `bonus:${install.id}:metadata`, label, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { tasks, failures };
}
