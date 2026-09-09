import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPacks } from "../shared/packs";
import { getInstalledGameSettings } from "../electron/main/settings/installed";

const calls = vi.hoisted(() => ({
  config: vi.fn(), root: vi.fn(), libraries: vi.fn(), install: vi.fn(), settings: vi.fn(),
}));
vi.mock("../electron/main/config", () => ({ readConfig: calls.config }));
vi.mock("../electron/main/steam/library", () => ({ findSteamRoot: calls.root, listLibraries: calls.libraries }));
vi.mock("../electron/main/steam/resolve", () => ({ resolveInstall: calls.install }));
vi.mock("../electron/main/settings/service", () => ({ getGameSettings: calls.settings }));

beforeEach(() => {
  vi.resetAllMocks();
  calls.config.mockResolvedValue({ steamPath: "custom-steam" });
  calls.root.mockResolvedValue("resolved-steam");
  calls.libraries.mockResolvedValue(["library-A", "library-B"]);
  calls.install.mockResolvedValue({ installDir: "installed-game", buildId: "1" });
  calls.settings.mockResolvedValue({ sections: [] });
});

describe("installed settings reads", () => {
  it("resolves only the requested game and reuses the resolved Steam root for native settings", async () => {
    await getInstalledGameSettings("mgs1", "account");
    expect(calls.root).toHaveBeenCalledExactlyOnceWith("custom-steam");
    expect(calls.install).toHaveBeenCalledExactlyOnceWith(loadPacks().find(pack => pack.id === "mgs1"), ["library-A", "library-B"]);
    expect(calls.settings).toHaveBeenCalledExactlyOnceWith("mgs1", "installed-game", "account", "resolved-steam");
  });

  it("checks installation availability again on retry without serving a stale install", async () => {
    await getInstalledGameSettings("mgs3");
    calls.install.mockResolvedValue(null);
    await expect(getInstalledGameSettings("mgs3")).rejects.toThrow("This game is not installed.");
    expect(calls.settings).toHaveBeenCalledTimes(1);
  });

  it("does not read settings when Steam is unavailable", async () => {
    calls.root.mockResolvedValue(null);
    await expect(getInstalledGameSettings("mgs4")).rejects.toThrow("This game is not installed.");
    expect(calls.install).not.toHaveBeenCalled();
    expect(calls.settings).not.toHaveBeenCalled();
  });
});
