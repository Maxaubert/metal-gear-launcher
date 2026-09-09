import { stat } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { achievementIconUrl, type Achievement, type AchievementSource } from "../../../shared/achievements";
import type { Pack } from "../../../shared/packs";

const MAX_ACHIEVEMENTS = 5000;
const TITLES: Record<string, readonly string[]> = {
  mg12: ["Metal Gear", "Metal Gear 2 Solid Snake", "Metal Gear & Metal Gear 2 Solid Snake"],
  mgs1: ["Metal Gear Solid", "Metal Gear Solid Integral"],
  mgs2: ["Metal Gear Solid 2", "Metal Gear Solid 2 Sons of Liberty", "Metal Gear Solid 2 Substance"],
  mgs3: ["Metal Gear Solid 3", "Metal Gear Solid 3 Snake Eater", "Metal Gear Solid 3 Subsistence"],
  mgs4: ["Metal Gear Solid 4", "Metal Gear Solid 4 Guns of the Patriots"],
  mgspw: ["Metal Gear Solid Peace Walker"],
};

function normalizeTitle(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/ (master collection version|hd edition)$/, "");
}

function titleValue(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4000) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object" && "title" in parsed && typeof parsed.title === "string") return parsed.title;
  } catch { return value; }
  return undefined;
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  // Galaxy stores UTC timestamps without a timezone suffix.
  const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value;
  const time = Date.parse(normalized);
  return Number.isFinite(time) && time > 0 ? time : undefined;
}

type Row = Record<string, unknown>;
function rows(db: DatabaseSync, sql: string, ...args: SQLInputValue[]): Row[] {
  return db.prepare(sql).all(...args);
}

function hasTable(db: DatabaseSync, name: string): boolean {
  // Reject views: only these physical cache tables are part of this reader's contract.
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1").get(name));
}

function activeUser(db: DatabaseSync): string | undefined {
  if (!hasTable(db, "Users")) return undefined;
  const users = rows(db, "SELECT CAST(id AS TEXT) AS id FROM Users LIMIT 101")
    .filter(row => typeof row.id === "string" && /^[1-9]\d*$/.test(row.id));
  if (users.length === 1) return String(users[0]!.id);
  if (!users.length || users.length > 100 || !hasTable(db, "UserRecentClientLanguages")) return undefined;
  const recent = rows(db, `SELECT CAST(userId AS TEXT) AS id, MAX(lastUsed) AS lastUsed
    FROM UserRecentClientLanguages GROUP BY userId ORDER BY lastUsed DESC LIMIT 101`)
    .map(row => ({ id: String(row.id), time: timestamp(row.lastUsed) }))
    .filter((row): row is { id: string; time: number } => row.time !== undefined && users.some(user => user.id === row.id))
    .sort((a, b) => b.time - a.time);
  const first = recent[0];
  if (!first || first.time <= (recent[1]?.time ?? 0)) return undefined;
  // A historic language preference cannot establish who is currently using a shared PC.
  if (first.time < Date.now() - 30 * 86400_000 || first.time > Date.now() + 60_000) return undefined;
  return first.id;
}

async function matchingReleases(db: DatabaseSync, pack: Pack): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const expected = new Set((TITLES[pack.id] ?? []).map(normalizeTitle));
  const add = (release: unknown, title: unknown) => {
    const name = titleValue(title);
    if (typeof release === "string" && /^gog_\d{1,20}$/.test(release) && name && expected.has(normalizeTitle(name))) {
      result.set(release, name.slice(0, 400));
    }
  };
  if (hasTable(db, "GamePieces") && hasTable(db, "GamePieceTypes")) {
    for (const row of rows(db, `SELECT p.releaseKey, substr(p.value, 1, 4001) AS value
      FROM GamePieces p JOIN GamePieceTypes t ON t.id = p.gamePieceTypeId
      WHERE t.type IN ('title', 'originalTitle') AND p.releaseKey GLOB 'gog_[0-9]*'
        AND p.value LIKE '%metal%gear%' LIMIT 101`)) add(row.releaseKey, row.value);
  }
  await yieldTurn();
  if (hasTable(db, "Products")) {
    for (const row of rows(db, `SELECT CAST(id AS TEXT) AS id, substr(name, 1, 4001) AS name
      FROM Products WHERE name LIKE '%metal%gear%' LIMIT 101`)) add(`gog_${row.id}`, row.name);
  }
  return result;
}

function readRelease(db: DatabaseSync, release: string, title: string, user: string | undefined,
  updatedAt: number): AchievementSource | undefined {
  const definitions = rows(db, `SELECT apikey, imageUnlockedUrl, imageLockedUrl, isVisible, rarity
    FROM Achievements WHERE gameReleaseKey = ? LIMIT ?`, release, MAX_ACHIEVEMENTS + 1);
  if (!definitions.length || definitions.length > MAX_ACHIEVEMENTS) return undefined;
  const translations = new Map<string, Row>();
  if (hasTable(db, "LocalizedAchievements")) {
    const languages = hasTable(db, "Languages")
      ? rows(db, "SELECT id FROM Languages WHERE code IN ('en', 'en-US', 'en-GB') LIMIT 10").map(row => row.id) : [];
    const cachedLanguages = rows(db, `SELECT DISTINCT languageId FROM LocalizedAchievements
      WHERE gameReleaseKey = ? LIMIT 100`, release).map(row => row.languageId);
    const language = cachedLanguages.find(id => languages.includes(id)) ?? cachedLanguages[0];
    const localized = language === undefined ? [] : rows(db, `SELECT apikey, name, description, languageId FROM LocalizedAchievements
      WHERE gameReleaseKey = ? AND languageId = ? LIMIT ?`, release, language as SQLInputValue, MAX_ACHIEVEMENTS);
    for (const row of localized) {
      const id = String(row.apikey);
      if (!translations.has(id)) translations.set(id, row);
    }
  }
  const personal = new Map<string, Row>();
  if (user && hasTable(db, "UserAchievements")) {
    for (const row of rows(db, `SELECT apikey, isUnlocked, unlockTime FROM UserAchievements
      WHERE gameReleaseKey = ? AND userId = ? LIMIT ?`, release, user, MAX_ACHIEVEMENTS)) personal.set(String(row.apikey), row);
  }
  const achievements: Achievement[] = [];
  for (const row of definitions) {
    if (typeof row.apikey !== "string" || !row.apikey || row.apikey.length > 512) continue;
    const localized = translations.get(row.apikey);
    const own = personal.get(row.apikey);
    const unlocked = own?.isUnlocked === 1 ? true : own?.isUnlocked === 0 ? false : null;
    const date = unlocked ? timestamp(own?.unlockTime) : undefined;
    const percent = typeof row.rarity === "number" && Number.isFinite(row.rarity) && row.rarity >= 0 && row.rarity <= 100 ? row.rarity : null;
    achievements.push({ id: row.apikey,
      name: typeof localized?.name === "string" && localized.name ? localized.name.slice(0, 2000) : row.apikey,
      description: typeof localized?.description === "string" ? localized.description.slice(0, 10000) : "",
      iconUrl: achievementIconUrl(unlocked === false ? row.imageLockedUrl : row.imageUnlockedUrl),
      unlocked, ...(date ? { unlockedAt: Math.floor(date / 1000) } : {}), percent, hidden: row.isVisible === 0 });
  }
  if (!achievements.length) return undefined;
  return { id: release, platform: "gog", label: `GOG Galaxy · ${title}`, status: "ready",
    personalStatus: achievements.some(item => item.unlocked !== null) ? "available" : "unavailable",
    message: "From GOG Galaxy's local cache. Open Galaxy to update trophies.",
    updatedAt, stale: true, achievements };
}

/** Galaxy's local cache is optional and never used to infer support or another user's unlocks. */
export async function readGogAchievements(pack: Pack, options: { databasePath?: string } = {}): Promise<AchievementSource[]> {
  const databasePath = options.databasePath ?? join(process.env.PROGRAMDATA ?? "C:\\ProgramData", "GOG.com", "Galaxy", "storage", "galaxy-2.0.db");
  let db: DatabaseSync | undefined;
  try {
    const info = await stat(databasePath);
    if (!info.isFile() || info.size > 2 * 1024 ** 3) return [];
    const wal = await stat(`${databasePath}-wal`).catch(() => undefined);
    const updatedAt = Math.max(info.mtimeMs, wal?.mtimeMs ?? 0);
    // Dynamic import also keeps launchers with no node:sqlite support functional.
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(databasePath, { readOnly: true, timeout: 50, allowExtension: false });
    db.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
    if (!hasTable(db, "Achievements")) return [];
    const releases = await matchingReleases(db, pack);
    if (!releases.size) return [];
    const user = activeUser(db);
    const sources: AchievementSource[] = [];
    for (const [release, title] of [...releases].slice(0, 20)) {
      await yieldTurn();
      const source = readRelease(db, release, title, user, updatedAt);
      if (source) sources.push(source);
    }
    return sources;
  } catch {
    // Missing, locked, corrupt or incompatible Galaxy databases are unavailable, never fatal.
    return [];
  } finally {
    try { db?.close(); } catch { /* A failed open may already have closed its connection. */ }
  }
}
