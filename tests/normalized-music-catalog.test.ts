import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMenuMusicLibrary } from "../electron/main/music/library";
import { getBonusPlaylist } from "../electron/main/bonus/playlist";
import { getNativeSoundtracks } from "../electron/main/music/nativeSoundtracks";
import { analyzeMusicLoudness } from "../electron/main/music/loudness";
import { allowBonusFile } from "../electron/main/bonus/media";

vi.mock("../electron/main/music/loudness", () => ({ analyzeMusicLoudness: vi.fn() }));
vi.mock("../electron/main/music/nativeSoundtracks", async importOriginal => ({
  ...await importOriginal<typeof import("../electron/main/music/nativeSoundtracks")>(),
  getNativeSoundtracks: vi.fn(async () => []),
}));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("normalized music catalog sources", () => {
  it("analyzes only the deduplicated source and retains its gain in the bonus playlist", async () => {
    const root = await mkdtemp(join(tmpdir(), "normalized-catalog-")); roots.push(root);
    const folder = join(root, "music", "mgs1"); await mkdir(folder, { recursive: true });
    for (const extension of ["flac", "mp3"]) await writeFile(join(folder, `Metal Gear Solid Main Theme.${extension}`), "audio");
    vi.mocked(analyzeMusicLoudness).mockResolvedValue({ lufs: -10.6, peak: 0.99 });
    const library = await getMenuMusicLibrary(root, "mgs1");
    expect(library.themes).toHaveLength(1);
    expect(analyzeMusicLoudness).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analyzeMusicLoudness).mock.calls[0]![1]).toMatch(/\.flac$/);
    expect(library.themes[0]!.normalizationGain).toBeCloseTo(0.3548, 4);
    const playlist = await getBonusPlaylist(root, null);
    expect(playlist[0]!.normalizationGain).toBe(library.themes[0]!.normalizationGain);
  });

  it("normalizes installed and explicit bonus tracks while leaving failed analysis playable", async () => {
    const root = await mkdtemp(join(tmpdir(), "normalized-catalog-")); roots.push(root);
    const file = join(root, "installed.m4a"); await writeFile(file, "audio");
    const url = await allowBonusFile(file, root, "audio/mp4");
    vi.mocked(getNativeSoundtracks).mockResolvedValue([{ sourceId: "snake", title: "Snake Eater", gameId: "mgs3", url }]);
    vi.mocked(analyzeMusicLoudness).mockResolvedValue({ lufs: -19.6, peak: 0.4 });
    expect((await getMenuMusicLibrary(root, "mgs3", "steam")).themes[0]!.normalizationGain).toBe(1);
    expect((await getBonusPlaylist(root, "steam"))[0]!.normalizationGain).toBe(1);
    const bonus = join(root, "music", "bonus"); await mkdir(bonus, { recursive: true });
    await writeFile(join(bonus, "Personal.flac"), "audio");
    vi.mocked(analyzeMusicLoudness).mockResolvedValue({ lufs: -12.4, peak: 0.99 });
    expect((await getBonusPlaylist(root, "steam"))[0]!.normalizationGain).toBeCloseTo(0.4365, 4);
    vi.mocked(analyzeMusicLoudness).mockResolvedValue(undefined);
    const fallback = (await getBonusPlaylist(root, "steam"))[0]!;
    expect(fallback.normalizationGain).toBe(1);
    expect(fallback.url).toMatch(/^hub-bonus:/);
  });
});
