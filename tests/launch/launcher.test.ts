/* eslint-disable @typescript-eslint/no-explicit-any -- brief's fake-child casts are deliberately loose (`any`) */
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { launchGame } from "../../electron/main/launch/launcher";
import { loadPacks } from "../../shared/packs";

const pack = loadPacks().find((p) => p.id === "mgs4")!;
const install = { installDir: "C:\\g\\METAL GEAR SOLID 4", buildId: "1" };
function fakeChild(exitCode: number | null, afterMs: number) {
  const c = new EventEmitter() as EventEmitter & { pid: number; unref: () => void };
  c.pid = 4242; c.unref = () => {};
  if (exitCode !== null) setTimeout(() => c.emit("exit", exitCode), afterMs);
  return c;
}

describe("launchGame", () => {
  it("preserves Unicode and spaced library paths as one executable argument", async () => {
    const spawn = vi.fn(() => fakeChild(null, 0));
    const alternate = { installDir: "R:\\Spill og prøver\\日本語\\METAL GEAR SOLID 4", buildId: "1" };
    expect((await launchGame(pack, alternate, { spawn: spawn as any, openExternal: vi.fn(), waitMs: 10 })).via).toBe("exe");
    expect(spawn).toHaveBeenCalledWith(`${alternate.installDir}\\MGS4\\mgs4.exe`, [], expect.objectContaining({ cwd: `${alternate.installDir}\\MGS4` }));
  });
  it("spawns the exe with cwd and SteamAppId and reports exe", async () => {
    const spawn = vi.fn(() => fakeChild(null, 0));
    const r = await launchGame(pack, install, { spawn: spawn as any, openExternal: vi.fn(), waitMs: 10 });
    expect(r.via).toBe("exe");
    expect(spawn).toHaveBeenCalledWith("C:\\g\\METAL GEAR SOLID 4\\MGS4\\mgs4.exe", [], expect.objectContaining({ cwd: "C:\\g\\METAL GEAR SOLID 4\\MGS4", env: expect.objectContaining({ SteamAppId: "2492670" }), detached: true }));
  });
  it("falls back to steam when the exe exits non-zero within the grace period", async () => {
    const openExternal = vi.fn();
    const r = await launchGame(pack, install, { spawn: (() => fakeChild(1, 5)) as any, openExternal, waitMs: 50 });
    expect(r.via).toBe("steam");
    expect(openExternal).toHaveBeenCalledWith("steam://rungameid/2492670");
  });
  it("uses steam directly when the pack says steamOnly", async () => {
    const openExternal = vi.fn();
    const r = await launchGame({ ...pack, launch: { ...pack.launch, steamOnly: true } }, install, { spawn: vi.fn() as any, openExternal, waitMs: 10 });
    expect(r.via).toBe("steam"); expect(openExternal).toHaveBeenCalled();
  });
});
