import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPacks } from "../shared/packs";
import type { AchievementSource } from "../shared/achievements";
const mocks = vi.hoisted(() => ({ read: vi.fn(), account: vi.fn() }));
vi.mock("../electron/main/achievements/steam", () => ({ readSteamAchievements: mocks.read, steamAccount: mocks.account }));
vi.mock("../electron/main/achievements/gog", () => ({ readGogAchievements: async () => [] }));
import { getAchievements } from "../electron/main/achievements/service";
const pack = loadPacks().find(p => p.id === "mgs1")!;
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); vi.resetAllMocks(); });
async function directory() { const root = await mkdtemp(join(tmpdir(), "hub-trophies-cache-")); roots.push(root); return root; }
const source = (): AchievementSource => ({ id: "steam:2131630", platform: "steam", label: "Steam", status: "ready", personalStatus: "available", stale: false, updatedAt: Date.now(), achievements: [{ id: "alpha", name: "Alpha", description: "Test", unlocked: true, percent: 0, hidden: false }] });
it("reuses a fresh per-account cache and explicitly refreshes against the platform", async () => {
  const root = await directory(); mocks.account.mockResolvedValue({ id: "a" }); mocks.read.mockResolvedValue(source());
  await getAchievements(pack, null, root);
  await getAchievements(pack, null, root);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  await getAchievements(pack, null, root, true);
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
it("keeps offline cached state visibly stale and never leaks it to another account", async () => {
  const root = await directory(); mocks.account.mockResolvedValue({ id: "a" }); mocks.read.mockResolvedValueOnce(source());
  await getAchievements(pack, null, root);
  mocks.read.mockResolvedValue({ ...source(), status: "unavailable", achievements: [], stale: true });
  const cached = await getAchievements(pack, null, root, true);
  expect(cached.sources[0]).toMatchObject({ stale: true, achievements: [{ id: "alpha", unlocked: true, percent: 0 }] });
  mocks.account.mockResolvedValue({ id: "b" });
  const other = await getAchievements(pack, null, root);
  expect(other.sources[0]?.achievements).toEqual([]);
});
it("does not retain old personal state after the platform makes it unavailable", async () => {
  const root = await directory(); mocks.account.mockResolvedValue({ id: "a" }); mocks.read.mockResolvedValueOnce(source());
  await getAchievements(pack, null, root);
  mocks.read.mockResolvedValue({ ...source(), personalStatus: "unavailable", achievements: [{ ...source().achievements[0], unlocked: null }] });
  const latest = await getAchievements(pack, null, root, true);
  expect(latest.sources[0]?.achievements[0]?.unlocked).toBeNull();
});
it("preserves cached percentages by icon when offline schema introduces an API name", async () => {
  const root = await directory(); mocks.account.mockResolvedValue({ id: "a" });
  const iconUrl = "https://shared.akamai.steamstatic.com/community_assets/images/apps/2131630/alpha.jpg";
  mocks.read.mockResolvedValueOnce({ ...source(), achievements: [{ ...source().achievements[0], id: "alpha.jpg", iconUrl, percent: 23.4 }] });
  await getAchievements(pack, null, root);
  mocks.read.mockResolvedValue({ ...source(), stale: true, achievements: [{ ...source().achievements[0], id: "alpha", iconUrl, percent: null }] });
  const cached = await getAchievements(pack, null, root, true);
  expect(cached.sources[0]?.achievements[0]?.percent).toBe(23.4);
});
