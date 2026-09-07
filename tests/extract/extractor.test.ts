/* eslint-disable @typescript-eslint/no-explicit-any -- brief's fixtures are deliberately loose (`any`) */
import { describe, expect, it, vi } from "vitest";
import { isStale, extractGame } from "../../electron/main/extract/extractor";
import { loadPacks } from "../../shared/packs";

describe("extractor", () => {
  it("is stale when build id or tool versions change", () => {
    const m = { gameId: "mgs3", buildId: "1", toolVersions: { assetStudio: "a", freemote: "b" }, files: {}, failed: {} } as any;
    expect(isStale(m, { installDir: "x", buildId: "1" }, { assetStudio: "a", freemote: "b" })).toBe(false);
    expect(isStale(m, { installDir: "x", buildId: "2" }, { assetStudio: "a", freemote: "b" })).toBe(true);
    expect(isStale(m, { installDir: "x", buildId: "1" }, { assetStudio: "a2", freemote: "b" })).toBe(true);
    expect(isStale(m, { installDir: "x", buildId: "1" }, { assetStudio: "a", freemote: "b" }, 1)).toBe(true);
    expect(isStale({ ...m, assetRevision: 1 }, { installDir: "x", buildId: "1" }, { assetStudio: "a", freemote: "b" }, 1)).toBe(false);
  });
  it("records failures per role and keeps going", async () => {
    const pack = loadPacks().find((p) => p.id === "mgs3")!;
    const unity = vi.fn(async (_d: string, a: any) => { if (a.role === "logo") throw new Error("nope"); });
    const events: string[] = [];
    const m = await extractGame(pack, { installDir: "C:\\g", buildId: "9" }, (p) => events.push(`${p.role}:${p.status}`),
      { unity, m2: vi.fn(), assetsDir: () => "C:\\tmp\\hub-test\\mgs3", toolVersions: () => ({ assetStudio: "a", freemote: "b" }), writeManifest: vi.fn() });
    expect(m.failed.logo).toMatch(/nope/);
    expect(Object.keys(m.files)).toContain("mainVisual");
    expect(events).toContain("logo:failed");
  });
});
