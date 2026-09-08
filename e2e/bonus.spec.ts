import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { BonusLibrary } from "../shared/bonus";

test("combined bonus content handles missing installs, both volumes, playback, chapters and returning to game selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-bonus-e2e-"));
  const data = join(root, "hub");
  await cp(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures/bonus/test-video.mp4"), join(data, "assets/mg12/bonus-test.mp4"));
  const app = await electron.launch({ args: [join(__dirname, "../out/main/index.js"), "--game", "mgs2"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" } });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 15000 });
    const noInstalls = await page.evaluate(() => window.hub.getBonusContent());
    expect(noInstalls.ok && noInstalls.value.tracks.length).toBe(0);
    expect(noInstalls.ok && noInstalls.value.videos.length).toBe(0);
    await page.keyboard.press("Tab");
    // Seventh entry must fit and remain reachable with the keyboard.
    await page.getByTestId("tile-bonus").hover();
    await expect(page.getByTestId("tile-bonus")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("bonus-content")).toBeVisible();
    await expect(page.getByTestId("bonus-content")).toContainText("Install Bonus Content");
    await expect(page.locator("#menu-music")).toHaveJSProperty("paused", true);

    const artwork = "hub-asset://mg12/mainVisual.png";
    const url = "hub-asset://mg12/bonus-test.mp4";
    const library: BonusLibrary = { volumes: [{ id: "vol1", installed: true }, { id: "vol2", installed: true }], warnings: [],
      artwork: { mainVisual: artwork, video1: artwork, video2: artwork },
      tracks: Array.from({ length: 12 }, (_, index) => ({ id: `track-${index}`, title: `${String(index + 1).padStart(2, "0")} Test soundtrack ${index + 1}`,
        volume: index < 6 ? "vol1" : "vol2", url: `${url}?track=${index}`, duration: 24, artworkUrl: artwork })),
      videos: [{ id: "novel", title: "Test graphic novel (English)", volume: "vol1", url, duration: 24, artworkUrl: artwork, chapters: [0, 12], language: "en" }] };
    await app.evaluate(({ ipcMain }, result) => {
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => ({ ok: true, value: result }));
    }, library);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByTestId("bonus-menu-soundtrack").click();
    const music = page.getByTestId("bonus-soundtrack-screen");
    await expect(music).toBeVisible();
    await expect(music.locator("[data-testid^=bonus-track-]")).toHaveCount(12);
    await page.mouse.move(0, 0);
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("bonus-track-track-10")).toHaveAttribute("aria-current", "true");
    const rowVisible = await page.getByTestId("bonus-track-track-10").evaluate(el => {
      const row = el.getBoundingClientRect(), list = el.parentElement!.getBoundingClientRect();
      return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
    });
    expect(rowVisible).toBe(true);
    await page.keyboard.press("Enter");
    await expect.poll(() => music.locator("audio").evaluate(el => el.currentTime)).toBeGreaterThan(0.1);
    await expect(page.locator("#menu-music")).toHaveJSProperty("paused", true);
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("bonus-track-track-11")).toHaveAttribute("aria-current", "true");
    await expect.poll(() => music.locator("audio").evaluate(el => el.currentTime)).toBeGreaterThan(0.1);
    await expect(music.locator("audio")).toHaveJSProperty("paused", false);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => music.locator("audio").evaluate(el => el.currentTime)).toBeGreaterThan(10);
    await page.keyboard.press("1");
    await expect(music.getByRole("button", { name: "Repeat", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("2");
    await expect(music.getByRole("button", { name: "Shuffle", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(music.locator("audio")).toHaveJSProperty("paused", true);
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      expect(await music.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("audio:not(#menu-music)")).toHaveCount(0);
    await page.getByTestId("bonus-menu-videos").click();
    await page.getByTestId("bonus-video-novel").click();
    await page.mouse.move(0, 0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect.poll(() => video.evaluate(el => el.currentTime)).toBeGreaterThan(12);
    await expect.poll(() => video.evaluate(el => el.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(video).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bonus-content")).toBeVisible();
    await page.getByTestId("bonus-back").click();
    await expect(page.getByTestId("game-selection")).toBeVisible();
    await expect(page.locator("#menu-music")).toHaveJSProperty("paused", false);
    const vol2Only: BonusLibrary = { ...library, volumes: [{ id: "vol1", installed: false }, { id: "vol2", installed: true }],
      tracks: library.tracks.filter(track => track.volume === "vol2"), videos: [], warnings: ["Some bonus files are unavailable."] };
    await app.evaluate(({ ipcMain }, result) => {
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => ({ ok: true, value: result }));
    }, vol2Only);
    await page.getByTestId("tile-bonus").click();
    await expect(page.getByTestId("bonus-content")).toHaveAttribute("data-art-volume", "vol2");
    await expect(page.getByTestId("bonus-menu-videos")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh Library (R)" })).toBeVisible();
    await app.evaluate(({ ipcMain }, result) => {
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => ({ ok: true, value: { ...result, warnings: [] } }));
    }, vol2Only);
    await page.getByRole("button", { name: "Refresh Library (R)" }).click();
    await expect(page.getByRole("button", { name: "Refresh Library (R)" })).toHaveCount(0);
    await page.getByTestId("bonus-menu-soundtrack").click();
    await expect(page.getByTestId("bonus-soundtrack-screen").locator("[data-testid^=bonus-track-]")).toHaveCount(6);
    await page.keyboard.press("Escape");
    await page.getByTestId("bonus-back").click();
    await page.getByTestId("tile-mgs3").click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected fixture directory");
    await rm(root, { recursive: true, force: true });
  }
});
