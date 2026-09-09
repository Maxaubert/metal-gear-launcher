import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBinaryVdf } from "../electron/main/achievements/binaryVdf";
import { mergeSteamAchievements, parseSteamGlobal, parseSteamLocal, parseSteamPlayer } from "../electron/main/achievements/steamParsing";
import { readSteamAchievements, steamAccount } from "../electron/main/achievements/steam";
import { loadPacks } from "../shared/packs";
import { achievementIconUrl } from "../shared/achievements";

const id = "76561198000000000";
const icon = "https://shared.akamai.steamstatic.com/community_assets/images/apps/2131630/alpha.jpg";
const html = `<div class="achieveRow"><div class="achieveImgHolder"><img src="${icon}"></div><div class="achievePercent">23.4%</div><div class="achieveTxt"><h3>First &amp; Last</h3><h5>Finish the &lt;test&gt;.</h5></div></div>`;
const xml = `<playerstats><privacyState>public</privacyState><player><steamID64>${id}</steamID64></player><achievements><achievement closed="1"><apiname>ALPHA</apiname><name><![CDATA[First & Last]]></name><description>Finish.</description><iconClosed>${icon}</iconClosed><unlockTimestamp>1700000000</unlockTimestamp></achievement></achievements></playerstats>`;
const schema = { "2131630": { stats: { "1": { bits: { "31": { name: "ALPHA", display: { name: { english: "First & Last" }, desc: { english: "Finish." }, hidden: 1, icon: "alpha.jpg" } } } } } } };

describe("Steam trophy parsing", () => {
  it("joins percentages by icon/API identity even when API case and order differ", () => {
    const global = parseSteamGlobal(html), personal = parseSteamPlayer(xml, id)!;
    const local = parseSteamLocal(schema, { cache: { crc: 4, "1": { data: 0 } } }, 2131630);
    const result = mergeSteamAchievements(global, personal, local);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "alpha", name: "First & Last", description: "Finish the <test>.", percent: 23.4, unlocked: true, hidden: true, unlockedAt: 1700000000 });
  });
  it("never treats private, malformed, or another player's data as unlocked/locked", () => {
    expect(parseSteamPlayer(xml.replace("public", "private"), id)).toBeNull();
    expect(parseSteamPlayer(xml, "76561198000000001")).toBeNull();
    expect(parseSteamPlayer("<html>Sign in</html>", id)).toBeNull();
    expect(parseSteamPlayer(xml.replace('closed="1"', 'closed="oops"'), id)).toEqual([]);
  });
  it("keeps unknown percentages separate from real zero and preserves fractional rarity", () => {
    expect(parseSteamGlobal(html.replace("23.4%", "0%"))[0]?.percent).toBe(0);
    expect(parseSteamGlobal(html.replace("23.4%", "0.04%"))[0]?.percent).toBe(.04);
    expect(parseSteamGlobal(html.replace("23.4%", "unavailable"))[0]?.percent).toBeNull();
    expect(parseSteamGlobal(html.replace("23.4%", "101%"))[0]?.percent).toBeNull();
  });
  it("reads signed achievement bitsets, while an uninitialized cache stays unknown", () => {
    expect(parseSteamLocal(schema, { cache: { crc: 4, "1": { data: -2147483648, AchievementTimes: { "31": 1700000000 } } } }, 2131630)[0]).toMatchObject({ unlocked: true, unlockedAt: 1700000000 });
    expect(parseSteamLocal(schema, { cache: { crc: 4 } }, 2131630)[0]?.unlocked).toBe(false);
    expect(parseSteamLocal(schema, { cache: { crc: 0 } }, 2131630)[0]?.unlocked).toBeNull();
  });
  it("does not duplicate trophies when only local and personal definitions are available", () => {
    const local = parseSteamLocal(schema, {}, 2131630);
    expect(mergeSteamAchievements([], parseSteamPlayer(xml, id)!, local)).toHaveLength(1);
  });
  it("clears an old local earned date when the public profile now reports locked", () => {
    const local = parseSteamLocal(schema, { cache: { crc: 4, "1": { data: -2147483648, AchievementTimes: { "31": 1700000000 } } } }, 2131630);
    const personal = parseSteamPlayer(xml.replace('closed="1"', 'closed="0"'), id)!;
    const result = mergeSteamAchievements(parseSteamGlobal(html), personal, local);
    expect(result[0]?.unlocked).toBe(false);
    expect(result[0]?.unlockedAt).toBeUndefined();
  });
  it("rejects unsafe image URLs", () => {
    for (const url of ["javascript:alert(1)", "file:///c:/secret", "https://steamstatic.com.evil.test/a.png", "http://images.gog.com/a.png", "https://user:pass@images.gog.com/a.png"]) expect(achievementIconUrl(url)).toBeUndefined();
    expect(achievementIconUrl(icon)).toBe(icon);
  });
  it("parses binary KeyValues and rejects corrupt or unsupported cache fields", () => {
    expect(parseBinaryVdf(Buffer.from([0, 99, 0, 2, 110, 0, 42, 0, 0, 0, 8, 8]))).toMatchObject({ c: { n: 42 } });
    for (const buffer of [Buffer.from([1, 1]), Buffer.from([2, 1, 0, 1]), Buffer.from([9, 0]), Buffer.from([0, 97, 0])]) expect(() => parseBinaryVdf(buffer)).toThrow();
  });
  it("handles platform failure without manufacturing earned or locked trophies", async () => {
    const pack = loadPacks().find(p => p.id === "mgs1")!;
    const result = await readSteamAchievements(pack, null, null, async () => { throw new Error("Offline"); });
    expect(result).toMatchObject({ status: "unavailable", personalStatus: "unavailable", achievements: [] });
    const live = await readSteamAchievements(pack, null, { id, accountId: "39734272", name: "Player" }, async url => url.includes("profiles") ? xml : html);
    expect(live.achievements[0]).toMatchObject({ unlocked: true, percent: 23.4 });
    expect(live.stale).toBe(false);
  });
  it("selects a single recent Steam account and avoids guessing on a shared PC", async () => {
    const root = await mkdtemp(join(tmpdir(), "hub-trophies-account-"));
    try {
      await mkdir(join(root, "config"));
      const file = join(root, "config", "loginusers.vdf");
      await writeFile(file, `"users" { "${id}" { "MostRecent" "1" "PersonaName" "Player" } "76561198000000001" { "MostRecent" "0" } }`);
      expect(await steamAccount(root)).toMatchObject({ id, accountId: "39734272", name: "Player" });
      await writeFile(file, `"users" { "${id}" { } "76561198000000001" { } }`);
      expect(await steamAccount(root)).toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
