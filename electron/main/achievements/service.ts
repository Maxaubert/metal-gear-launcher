import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { achievementSourceSchema, type AchievementsSnapshot } from "@shared/achievements";
import type { Pack } from "@shared/packs";
import { readGogAchievements } from "./gog";
import { readSteamAchievements, steamAccount } from "./steam";
import { iconKey } from "./steamParsing";
import { achievementIconUrl } from "@shared/achievements";

const pending = new Map<string, Promise<AchievementsSnapshot>>();
const CACHE_MS = 5 * 60 * 1000;

export async function getAchievements(pack: Pack, steamRoot: string | null, dataRoot: string, refresh = false): Promise<AchievementsSnapshot> {
  const account = await steamAccount(steamRoot);
  const identity = createHash("sha256").update(`${steamRoot ?? ""}\n${account?.id ?? "anonymous"}`).digest("hex").slice(0, 24);
  const directory = join(dataRoot, "achievements"), file = join(directory, `${pack.id}-${identity}.json`);
  const key = file;
  const existing = pending.get(key); if (existing) return existing;
  const job = (async (): Promise<AchievementsSnapshot> => {
    const gog = readGogAchievements(pack, process.env.HUB_GOG_DATABASE ? { databasePath: process.env.HUB_GOG_DATABASE } : undefined);
    let cached;
    try {
      const value = achievementSourceSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (value.id === `steam:${pack.steam.appId}` && value.platform === "steam") cached = value;
    } catch { /* First read or an invalid cache is rebuilt from the platform. */ }
    let steam = cached && !refresh && Date.now() - cached.updatedAt >= 0 && Date.now() - cached.updatedAt < CACHE_MS
      ? cached : await readSteamAchievements(pack, steamRoot, account);
    if (steam !== cached) {
      if (cached && steam.stale) {
        if (!steam.achievements.length) steam = { ...cached, stale: true, message: "Steam is unavailable. Showing cached trophies; use Refresh to check again." };
        else {
          const old = new Map(cached.achievements.map(a => [a.id, a]));
          const icons = new Map(cached.achievements.filter(a => achievementIconUrl(a.iconUrl)).map(a => [iconKey(a.iconUrl), a]));
          steam = { ...steam, achievements: steam.achievements.map(a => ({ ...a,
            percent: a.percent ?? old.get(a.id)?.percent ?? (achievementIconUrl(a.iconUrl) ? icons.get(iconKey(a.iconUrl))?.percent : null) ?? null })) };
        }
      }
      if (steam.achievements.length && !steam.stale) {
        try {
          await mkdir(directory, { recursive: true });
          const temporary = `${file}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(steam), "utf8");
          await rename(temporary, file);
        } catch { /* A read-only cache location must not hide live trophy data. */ }
      }
    }
    return { gameId: pack.id, sources: [steam, ...await gog] };
  })();
  pending.set(key, job);
  try { return await job; } finally { if (pending.get(key) === job) pending.delete(key); }
}
