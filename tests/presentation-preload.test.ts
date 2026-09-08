/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { afterEach, expect, it, vi } from "vitest";
import type { GameState } from "../shared/ipc";
import { loadPacks } from "../shared/packs";
import { preloadPresentation } from "../src/hub/preloadPresentation";
import { preloadMgs1Typography } from "../src/typography/mgs1Typography";

vi.mock("../src/typography/mgs1Typography", () => ({ preloadMgs1Typography: vi.fn(async () => {}) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const game = (id: GameState["pack"]["id"], installed: boolean, assetUrls: GameState["assetUrls"]): GameState => ({
  pack: loadPacks().find(pack => pack.id === id)!, installed, assetUrls, stale: false,
});
function fontDocument(ready: Promise<unknown> = Promise.resolve()) {
  vi.stubGlobal("document", { fonts: { ready, add: vi.fn() } });
}

it("ignores every cached presentation asset belonging to an uninstalled game", async () => {
  const decoded: string[] = [];
  vi.stubGlobal("Image", class { src = ""; async decode() { decoded.push(this.src); } });
  const font = vi.fn();
  vi.stubGlobal("FontFace", font);
  fontDocument();
  await preloadPresentation([
    game("mgs1", false, { mainVisual: "hub-asset://mgs1/broken.png", nativeTextMetrics: "hub-asset://mgs1/missing.json", fontUi: "hub-asset://mgs1/missing.ttf" }),
    game("mgs2", true, { mainVisual: "hub-asset://mgs2/installed-good.png" }),
  ]);
  expect(decoded).toEqual(["hub-asset://mgs2/installed-good.png"]);
  expect(font).not.toHaveBeenCalled();
  expect(preloadMgs1Typography).not.toHaveBeenCalled();
});

it("does not cache an installed image failure and retries its decode after repair", async () => {
  const decode = vi.fn().mockRejectedValueOnce(new Error("Broken image")).mockResolvedValue(undefined);
  vi.stubGlobal("Image", class { src = ""; decode = decode; });
  fontDocument();
  const games = [game("mgs2", true, { mainVisual: "hub-asset://mgs2/recoverable.png" })];
  await expect(preloadPresentation(games)).rejects.toThrow("Broken image");
  await preloadPresentation(games);
  expect(decode).toHaveBeenCalledTimes(2);
});

it("bounds a stalled font registry and allows a fresh retry", async () => {
  vi.useFakeTimers();
  fontDocument(new Promise(() => {}));
  const loading = expect(preloadPresentation([])).rejects.toThrow(/menu fonts/);
  await vi.advanceTimersByTimeAsync(15000);
  await loading;
  fontDocument();
  await preloadPresentation([]);
  expect(vi.getTimerCount()).toBe(0);
});
