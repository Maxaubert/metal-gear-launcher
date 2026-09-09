import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadPacks } from "../shared/packs";
import { achievementSourceSchema } from "../shared/achievements";
import { readGogAchievements } from "../electron/main/achievements/gog";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error("Unexpected fixture directory");
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
const pack = (id: string) => loadPacks().find(item => item.id === id)!;

async function fixture(edit?: (db: DatabaseSync) => void): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hub-gog-achievements-"));
  directories.push(directory);
  const path = join(directory, "galaxy.db");
  const db = new DatabaseSync(path);
  try {
    // Build the disposable cache in one transaction instead of syncing every row to disk.
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE Achievements(gameReleaseKey TEXT, apikey TEXT, backendId TEXT, imageUnlockedUrl TEXT, imageLockedUrl TEXT, isVisible INTEGER, rarity REAL, raritySlug TEXT);
      CREATE TABLE LocalizedAchievements(gameReleaseKey TEXT, apikey TEXT, name TEXT, description TEXT, languageId INTEGER, isLocalized INTEGER);
      CREATE TABLE UserAchievements(gameReleaseKey TEXT, userId INTEGER, apikey TEXT, unlockTime TEXT, isUnlocked INTEGER);
      CREATE TABLE GamePieces(releaseKey TEXT, gamePieceTypeId INTEGER, userId INTEGER, value TEXT, languageId INTEGER);
      CREATE TABLE GamePieceTypes(id INTEGER, type TEXT);
      CREATE TABLE Products(id INTEGER, name TEXT, parentId INTEGER);
      CREATE TABLE Languages(id INTEGER, name TEXT, code TEXT);
      CREATE TABLE Users(id INTEGER);
      CREATE TABLE UserRecentClientLanguages(languageId INTEGER, userId INTEGER, lastUsed TEXT);
      CREATE TABLE ProductAuthorizations(secret TEXT);
      INSERT INTO ProductAuthorizations VALUES ('this table must never be read');
      INSERT INTO Users VALUES (1);
      INSERT INTO Languages VALUES (1, 'French', 'fr'), (2, 'English', 'en-US');
      INSERT INTO GamePieceTypes VALUES (1, 'title'), (2, 'originalTitle');
      INSERT INTO GamePieces VALUES ('gog_123', 1, 1, '{"title":"METAL GEAR SOLID"}', 2);
      INSERT INTO Achievements VALUES
        ('gog_123', 'first', 'a', 'https://images.gog.com/first.png', 'https://images.gog.com/locked.png', 1, 34.88, 'common'),
        ('gog_123', 'second', 'b', 'https://images.gog.com/second.png', 'https://images.gog.com/locked.png', 0, 44.28, 'common'),
        ('gog_123', 'unknown', 'c', 'https://unsafe.invalid/icon.png', NULL, 1, NULL, NULL);
      INSERT INTO LocalizedAchievements VALUES
        ('gog_123', 'first', 'Premier', 'Texte', 1, 1),
        ('gog_123', 'first', 'First trophy', 'A description', 2, 1),
        ('gog_123', 'second', 'Second trophy', 'Hidden description', 2, 1);
      INSERT INTO UserAchievements VALUES
        ('gog_123', 1, 'first', '2026-01-01 12:00:00', 1),
        ('gog_123', 1, 'second', NULL, 0);
    `);
    edit?.(db);
    db.exec("COMMIT");
  } finally { db.close(); }
  return path;
}

describe("GOG Galaxy cached achievements", () => {
  it("reads title, English names, native percent rarity and explicit unlocks without modifying the cache", async () => {
    const databasePath = await fixture();
    const before = await readFile(databasePath);
    const beforeStat = await stat(databasePath);
    const [source] = await readGogAchievements(pack("mgs1"), { databasePath });
    expect(achievementSourceSchema.safeParse(source).success).toBe(true);
    expect(source).toMatchObject({ id: "gog_123", platform: "gog", personalStatus: "available", stale: true, updatedAt: beforeStat.mtimeMs });
    expect(source!.achievements[0]).toMatchObject({ name: "First trophy", description: "A description", percent: 34.88, unlocked: true, unlockedAt: Date.parse("2026-01-01T12:00:00Z") / 1000 });
    expect(source!.achievements[1]).toMatchObject({ percent: 44.28, unlocked: false, hidden: true, iconUrl: "https://images.gog.com/locked.png" });
    expect(source!.achievements[2]).toMatchObject({ name: "unknown", percent: null, unlocked: null });
    expect(source!.achievements[2]!.iconUrl).toBeUndefined();
    expect(await readFile(databasePath)).toEqual(before);
    expect((await stat(databasePath)).mtimeMs).toBe(beforeStat.mtimeMs);
  });

  it("never labels imported Steam achievements as GOG or matches MGS2 as MGS1", async () => {
    const databasePath = await fixture(db => {
      db.exec(`UPDATE GamePieces SET value = '{"title":"Metal Gear Solid 2: Substance"}';
        INSERT INTO GamePieces VALUES ('steam_2131630', 1, 1, '{"title":"Metal Gear Solid"}', 2);
        INSERT INTO Achievements SELECT 'steam_2131630', apikey, backendId, imageUnlockedUrl, imageLockedUrl, isVisible, rarity, raritySlug FROM Achievements;`);
    });
    expect(await readGogAchievements(pack("mgs1"), { databasePath })).toEqual([]);
    expect(await readGogAchievements(pack("mgs2"), { databasePath })).toHaveLength(1);
  });

  it("matches exact originalTitle edition aliases and product metadata, requiring cached achievements", async () => {
    const databasePath = await fixture(db => {
      db.exec(`DELETE FROM GamePieces;
        INSERT INTO Products VALUES (123, 'METAL GEAR SOLID® - Master Collection Version', NULL), (456, 'METAL GEAR SOLID 3', NULL);`);
    });
    expect(await readGogAchievements(pack("mgs1"), { databasePath })).toHaveLength(1);
    expect(await readGogAchievements(pack("mgs3"), { databasePath })).toEqual([]);
    const db = new DatabaseSync(databasePath);
    db.exec(`DELETE FROM Products; INSERT INTO GamePieces VALUES ('gog_123', 2, 1, '{"title":"Metal Gear Solid: Peace Walker - HD Edition"}', 2);`);
    db.close();
    expect(await readGogAchievements(pack("mgspw"), { databasePath })).toHaveLength(1);
  });

  it("keeps every personal state unknown with multiple accounts and no reliable active user", async () => {
    const databasePath = await fixture(db => db.exec("INSERT INTO Users VALUES (2)"));
    const [source] = await readGogAchievements(pack("mgs1"), { databasePath });
    expect(source!.personalStatus).toBe("unavailable");
    expect(source!.achievements.every(item => item.unlocked === null && item.unlockedAt === undefined)).toBe(true);
  });

  it("uses only the uniquely recent client account, never another user's unlocks", async () => {
    const databasePath = await fixture(db => {
      db.exec("INSERT INTO Users VALUES (2); INSERT INTO UserAchievements VALUES ('gog_123',2,'first',NULL,0)");
      const add = db.prepare("INSERT INTO UserRecentClientLanguages VALUES (2, ?, ?)");
      add.run(1, new Date(Date.now() - 86400_000).toISOString());
      add.run(2, new Date().toISOString());
    });
    const [source] = await readGogAchievements(pack("mgs1"), { databasePath });
    expect(source!.achievements[0]!.unlocked).toBe(false);
    expect(source!.achievements[1]!.unlocked).toBeNull();
  });

  it.each(["tied", "historic"])("does not infer the active account from %s client history", async (kind) => {
    const databasePath = await fixture(db => {
      db.exec("INSERT INTO Users VALUES (2)");
      const date = new Date(Date.now() - (kind === "historic" ? 90 : 0) * 86400_000).toISOString();
      const add = db.prepare("INSERT INTO UserRecentClientLanguages VALUES (2, ?, ?)");
      add.run(1, date);
      if (kind === "tied") add.run(2, date);
    });
    const [source] = await readGogAchievements(pack("mgs1"), { databasePath });
    expect(source!.personalStatus).toBe("unavailable");
  });

  it("returns unavailable safely for missing, malformed, incompatible or unsupported SQLite runtimes", async () => {
    const databasePath = await fixture();
    expect(await readGogAchievements(pack("mgs1"), { databasePath: `${databasePath}.missing` })).toEqual([]);
    await writeFile(databasePath, "invalid SQLite file");
    expect(await readGogAchievements(pack("mgs1"), { databasePath })).toEqual([]);
    const empty = await fixture(db => db.exec("DROP TABLE Achievements"));
    expect(await readGogAchievements(pack("mgs1"), { databasePath: empty })).toEqual([]);
    vi.doMock("node:sqlite", () => { throw new Error("No such built-in module"); });
    try { expect(await readGogAchievements(pack("mgs1"), { databasePath: empty })).toEqual([]); }
    finally { vi.doUnmock("node:sqlite"); }
  });

  it("queries only known achievement metadata tables, never credential tables", async () => {
    const databasePath = await fixture();
    const prepare = vi.spyOn(DatabaseSync.prototype, "prepare");
    await readGogAchievements(pack("mgs1"), { databasePath });
    expect(prepare).toHaveBeenCalled();
    for (const [query] of prepare.mock.calls) {
      expect(query).not.toMatch(/ProductAuthorizations|SELECT\s+\*/i);
      const tables = [...query.matchAll(/(?:FROM|JOIN)\s+(\w+)/gi)].map(match => match[1]);
      expect(tables.every(table => ["sqlite_schema", "Achievements", "LocalizedAchievements", "UserAchievements", "Users", "Languages", "UserRecentClientLanguages", "Products", "GamePieces", "GamePieceTypes"].includes(table!))).toBe(true);
    }
  });
});
