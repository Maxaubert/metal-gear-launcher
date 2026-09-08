import { load } from "cheerio";
import { achievementIconUrl, type Achievement } from "@shared/achievements";
import { node, type BinaryNode } from "./binaryVdf";

export const iconKey = (url?: string) => url?.split("/").at(-1)?.split("?")[0]?.toLowerCase();
const empty = (id: string, name: string, description: string): Achievement => ({ id, name, description, percent: null, unlocked: null, hidden: false });

export function parseSteamGlobal(html: string): Achievement[] {
  const $ = load(html), result: Achievement[] = [];
  $(".achieveRow").each((index, row) => {
    const name = $(row).find(".achieveTxt h3").text().trim();
    if (!name) return;
    const iconUrl = achievementIconUrl($(row).find(".achieveImgHolder img").attr("src"));
    const percentText = $(row).find(".achievePercent").text().trim();
    const percent = /^\d+(?:\.\d+)?%$/.test(percentText) ? Number(percentText.slice(0, -1)) : NaN;
    result.push({ ...empty(iconKey(iconUrl) ?? `global-${index}`, name, $(row).find(".achieveTxt h5").text().trim()),
      iconUrl, percent: Number.isFinite(percent) && percent <= 100 ? percent : null });
  });
  return result;
}

export function parseSteamPlayer(xml: string, expectedSteamId: string): Achievement[] | null {
  const $ = load(xml, { xml: true });
  if ($("playerstats > privacyState").text() !== "public" || $("player > steamID64").text() !== expectedSteamId) return null;
  const result: Achievement[] = [];
  $("achievements > achievement").each((_index, row) => {
    const closed = $(row).attr("closed"), id = $(row).find("apiname").text().trim();
    if (!id || (closed !== "0" && closed !== "1")) return;
    const unlockedAt = Number($(row).find("unlockTimestamp").text());
    result.push({ ...empty(id.toLowerCase(), $(row).find("name").text().trim(), $(row).find("description").text().trim()),
      iconUrl: achievementIconUrl($(row).find("iconClosed").text().trim()), unlocked: closed === "1",
      ...(closed === "1" && unlockedAt > 0 ? { unlockedAt } : {}) });
  });
  return result;
}

export function parseSteamLocal(schema: BinaryNode, cache: BinaryNode, appId: number): Achievement[] {
  const result: Achievement[] = [], stats = node(node(schema[String(appId)]).stats), user = node(cache.cache);
  const known = typeof user.crc === "number" && user.crc !== 0;
  const localized = (value: BinaryNode[string] | undefined) => typeof value === "string" ? value : String(node(value).english ?? "");
  for (const [groupId, group] of Object.entries(stats)) {
    for (const [bitKey, bit] of Object.entries(node(node(group).bits))) {
      const bitNumber = Number(bitKey), data = node(bit), display = node(data.display);
      if (!Number.isInteger(bitNumber) || bitNumber < 0 || bitNumber > 31 || typeof data.name !== "string") continue;
      const groupData = node(user[groupId]), flags = typeof groupData.data === "number" ? groupData.data : 0;
      const unlocked = known ? Boolean((flags >>> bitNumber) & 1) : null;
      const time = node(groupData.AchievementTimes)[bitKey];
      result.push({ ...empty(data.name.toLowerCase(), localized(display.name), localized(display.desc)), hidden: display.hidden === 1,
        iconUrl: typeof display.icon === "string" ? achievementIconUrl(`https://shared.akamai.steamstatic.com/community_assets/images/apps/${appId}/${display.icon}`) : undefined,
        unlocked, ...(unlocked && typeof time === "number" && time > 0 ? { unlockedAt: time } : {}) });
    }
  }
  return result;
}

/** API names and icon hashes are stable keys; achievement ordering is not. */
export function mergeSteamAchievements(global: Achievement[], personal: Achievement[], local: Achievement[]): Achievement[] {
  const identity = [...personal, ...local];
  const byId = new Map(identity.map(a => [a.id.toLowerCase(), a]));
  const byIcon = new Map(identity.filter(a => a.iconUrl).map(a => [iconKey(a.iconUrl), a]));
  const personalById = new Map(personal.map(a => [a.id.toLowerCase(), a]));
  const base = global.length ? global : [...new Map([...local, ...personal].map(a => [a.id, a])).values()];
  const result: Achievement[] = base.map(item => {
    const match = byId.get(item.id.toLowerCase()) ?? byIcon.get(iconKey(item.iconUrl));
    const person = personalById.get(match?.id.toLowerCase() ?? item.id.toLowerCase());
    const owner = person ?? match ?? item;
    return { ...match, ...item, id: match?.id ?? item.id, hidden: match?.hidden ?? false,
      unlocked: owner.unlocked,
      unlockedAt: owner.unlocked === true ? owner.unlockedAt : undefined };
  });
  const keys = new Set(result.map(a => a.id));
  for (const item of identity) if (!keys.has(item.id)) { result.push(item); keys.add(item.id); }
  return result;
}
