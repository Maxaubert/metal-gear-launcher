import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBonusPlaylist } from "../electron/main/bonus/playlist";
import { ensureMenuMusicFolder } from "../electron/main/music/library";
import { discoverBonus } from "../electron/main/bonus/discovery";
import { BonusCache } from "../electron/main/bonus/cache";
import { getGameSoundtracks } from "../electron/main/music/gameSoundtracks";

vi.mock("../electron/main/bonus/discovery", () => ({ discoverBonus: vi.fn(async () => []) }));
vi.mock("../electron/main/bonus/cache", () => ({ BonusCache: { open: vi.fn() } }));
vi.mock("../electron/main/music/gameSoundtracks", () => ({ getGameSoundtracks: vi.fn(async () => []) }));

describe("bonus background playlist discovery", () => {
  let root: string;
  beforeEach(async () => { vi.clearAllMocks(); vi.mocked(discoverBonus).mockResolvedValue([]); vi.mocked(getGameSoundtracks).mockResolvedValue([]); root = await mkdtemp(join(tmpdir(), "bonus-playlist-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("curates existing local themes in series order without depending on Steam or changing files", async () => {
    const mgs1 = await ensureMenuMusicFolder(root, "mgs1");
    const mgs3 = await ensureMenuMusicFolder(root, "mgs3");
    const mg12 = await ensureMenuMusicFolder(root, "mg12");
    for (const file of ["End Title - The Best is Yet to Come.flac", "Metal Gear Solid Main Theme.flac", "Cavern.flac"]) await writeFile(join(mgs1, file), "music");
    await writeFile(join(mgs3, "1-07 Snake Eater.flac"), "music");
    await writeFile(join(mg12, "Theme of Solid Snake (Opening BGM 1).flac"), "music");
    const tracks = await getBonusPlaylist(root, null);
    expect(tracks.map(track => track.title)).toEqual(["Metal Gear Solid Main Theme", "1-07 Snake Eater", "End Title - The Best is Yet to Come", "Theme of Solid Snake (Opening BGM 1)"]);
    expect(tracks.every(track => track.url.startsWith("hub-music://"))).toBe(true);
    expect(discoverBonus).not.toHaveBeenCalled();
  });

  it("uses the explicit bonus folder in numeric filename order, with safe opaque URLs", async () => {
    const folder = join(root, "music", "bonus");
    await mkdir(folder, { recursive: true });
    for (const file of ["10 Finale.FLAC", "2 Second.mp3", "1 Opening.flac", "cover.png"]) await writeFile(join(folder, file), "music");
    await mkdir(join(folder, "3 Folder.flac"));
    const tracks = await getBonusPlaylist(root, null);
    expect(tracks.map(track => track.title)).toEqual(["1 Opening", "2 Second", "10 Finale"]);
    expect(tracks.every(track => /^hub-bonus:\/\/media\/[a-f0-9]{64}$/.test(track.url))).toBe(true);
    expect(discoverBonus).not.toHaveBeenCalled();
  });

  it("does not scan linked bonus folders outside hub data", async () => {
    const outside = await mkdtemp(join(tmpdir(), "bonus-outside-"));
    await mkdir(join(root, "music"));
    try {
      await writeFile(join(outside, "Private.flac"), "private");
      await symlink(outside, join(root, "music", "bonus"), "junction");
      expect(await getBonusPlaylist(root, null)).toEqual([]);
    } finally {
      await rm(join(root, "music", "bonus"), { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("falls back to available native streams without artwork decoding and skips missing or unsafe entries", async () => {
    const install = { id: "vol1" as const, path: join(root, "steam", "bonus"), build: "fixture" };
    const stream = join(install.path, "windata", "201", "stream");
    await mkdir(stream, { recursive: true });
    await writeFile(join(stream, "theme.m4a"), "audio");
    await writeFile(join(stream, "old.m4a"), "audio");
    vi.mocked(discoverBonus).mockResolvedValue([install]);
    const decode = vi.fn(async () => ({ directory: root, json: { param: {
      layout: ["old", "missing", "unsafe", "theme"], old: { file: "old", text: "01_Old_Snake" }, missing: { file: "absent", text: "Missing" },
      unsafe: { file: "../../outside", text: "Unsafe" }, theme: { file: "theme", text: "01_Snake_Eater" },
    } } }));
    vi.mocked(BonusCache.open).mockResolvedValue({ decode } as unknown as BonusCache);
    const tracks = await getBonusPlaylist(root, "alternate-steam");
    expect(tracks.map(track => track.title)).toEqual(["Snake Eater", "Old Snake"]);
    expect(decode.mock.calls).toEqual([["system/config/top_submenu_stream.psb.m"]]);
    expect(discoverBonus).toHaveBeenCalledWith("alternate-steam");
  });

  it("returns an empty playlist safely on fresh PCs and broken optional Steam installs", async () => {
    expect(await getBonusPlaylist(join(root, "fresh"), null)).toEqual([]);
    vi.mocked(discoverBonus).mockRejectedValue(new Error("Unavailable drive"));
    expect(await getBonusPlaylist(root, "missing-drive")).toEqual([]);
  });

  it("keeps installed classics when a user adds just one personal theme", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs3");
    await writeFile(join(folder, "Snake Eater.flac"), "personal");
    vi.mocked(getGameSoundtracks).mockResolvedValue([
      { sourceId: "game:mgs2:opening", gameId: "mgs2", title: "Metal Gear Solid Main Theme", url: "hub-bonus://media/main" },
      { sourceId: "bonus:snake", gameId: "mgs3", title: "Snake Eater ( Cynthia Harrell )", url: "hub-bonus://media/snake" },
    ]);
    const tracks = await getBonusPlaylist(root, "steam");
    expect(tracks.map(track => track.title)).toEqual(["Metal Gear Solid Main Theme", "Snake Eater"]);
    expect(tracks[1]?.url).toMatch(/^hub-music:/);
  });

  it("keeps distinct main theme recordings from different games", async () => {
    const folder = await ensureMenuMusicFolder(root, "mgs1");
    await writeFile(join(folder, "Metal Gear Solid Main Theme.flac"), "personal");
    vi.mocked(getGameSoundtracks).mockResolvedValue([
      { sourceId: "game:mgs2:opening", gameId: "mgs2", title: "Metal Gear Solid Main Theme", url: "hub-bonus://media/main" },
    ]);
    const tracks = await getBonusPlaylist(root, "steam");
    expect(tracks.map(track => track.title)).toEqual(["Metal Gear Solid Main Theme", "Metal Gear Solid Main Theme"]);
    expect(new Set(tracks.map(track => track.url)).size).toBe(2);
  });
});
