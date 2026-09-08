import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pack } from "@shared/packs";
import type { AchievementSource } from "@shared/achievements";
import { parseVdf } from "../steam/library";
import { parseBinaryVdf } from "./binaryVdf";
import { mergeSteamAchievements, parseSteamGlobal, parseSteamLocal, parseSteamPlayer } from "./steamParsing";

export type SteamAccount = { id: string; accountId: string; name: string };
export async function steamAccount(root: string | null): Promise<SteamAccount | null> {
  if (!root) return null;
  try {
    const users = parseVdf(await readFile(join(root, "config", "loginusers.vdf"), "utf8")).users;
    if (!users || typeof users !== "object") return null;
    const entries = Object.entries(users).filter(([id, value]) => /^7656119\d{10}$/.test(id) && typeof value === "object");
    const recent = entries.filter(([, value]) => typeof value === "object" && value.MostRecent === "1");
    const entry = recent.length === 1 ? recent[0] : entries.length === 1 ? entries[0] : null;
    if (!entry || typeof entry[1] !== "object") return null;
    const accountId = BigInt(entry[0]) - 76561197960265728n;
    if (accountId < 0 || accountId > 4294967295n) return null;
    return { id: entry[0], accountId: String(accountId), name: String(entry[1].PersonaName ?? "Steam player").slice(0, 100) };
  } catch { return null; }
}

export async function platformText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "Accept-Language": "en" } });
  const target = new URL(response.url || url);
  if (!response.ok || target.protocol !== "https:" || target.hostname !== "steamcommunity.com") throw new Error("Steam is unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Steam returned no data");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 5 * 1024 * 1024) throw new Error("Steam response is too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readSteamAchievements(pack: Pack, root: string | null, account: SteamAccount | null, request = platformText): Promise<AchievementSource> {
  const appId = pack.steam.appId;
  const [globalReply, playerReply, schema, cache] = await Promise.allSettled([
    request(`https://steamcommunity.com/stats/${appId}/achievements/?l=english`),
    account ? request(`https://steamcommunity.com/profiles/${account.id}/stats/${appId}/?xml=1&l=english`) : Promise.resolve(""),
    root ? readFile(join(root, "appcache", "stats", `UserGameStatsSchema_${appId}.bin`)) : Promise.reject(),
    root && account ? readFile(join(root, "appcache", "stats", `UserGameStats_${account.accountId}_${appId}.bin`)) : Promise.reject(),
  ]);
  let local: ReturnType<typeof parseSteamLocal> = [];
  if (schema.status === "fulfilled") {
    try { local = parseSteamLocal(parseBinaryVdf(schema.value), cache.status === "fulfilled" ? parseBinaryVdf(cache.value) : {}, appId); } catch { /* Cache formats may change independently of the hub. */ }
  }
  const global = globalReply.status === "fulfilled" ? parseSteamGlobal(globalReply.value) : [];
  const personal = playerReply.status === "fulfilled" && account ? parseSteamPlayer(playerReply.value, account.id) : null;
  const achievements = mergeSteamAchievements(global, personal ?? [], local);
  const personalKnown = achievements.some(a => a.unlocked !== null);
  const stale = !global.length;
  return { id: `steam:${appId}`, platform: "steam", label: account ? `Steam · ${account.name}` : "Steam",
    status: achievements.length ? "ready" : "unavailable", personalStatus: personalKnown ? "available" : "unavailable",
    updatedAt: Date.now(), stale, achievements,
    message: !achievements.length ? "Steam trophies are unavailable. Check your connection and whether this edition supports achievements."
      : !global.length ? "Steam is unavailable. Showing local trophy data; player percentages may be unavailable."
        : !personalKnown ? "Your unlock status is unavailable. Sign in to Steam and make game details public, or let Steam cache this game's stats."
          : undefined };
}
