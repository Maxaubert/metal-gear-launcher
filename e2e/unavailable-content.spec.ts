import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { BonusLibrary } from "../shared/bonus";

const videoIds = ["vol1-BD1_en", "vol1-BD2_en", "vol1-BD1_jp", "vol1-BD2_jp"];

async function fixture(installMgs3: boolean) {
  const root = await mkdtemp(join(tmpdir(), "hub-unavailable-e2e-"));
  const data = join(root, "hub"), steam = join(root, "Steam");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const close = async () => {
    await app?.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected fixture directory");
    await rm(root, { recursive: true, force: true });
  };
  try {
    await mkdir(join(steam, "steamapps"), { recursive: true });
    await writeFile(join(steam, "steam.exe"), "synthetic fixture");
    await cp(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
    await mkdir(join(data, "music/mgs3"), { recursive: true });
    await cp(join(data, "assets/mgs3/bgm.wav"), join(data, "music/mgs3/Custom Theme.wav"));
    await cp(join(__dirname, "fixtures/bonus/test-video.mp4"), join(data, "assets/mg12/bonus-test.mp4"));
    if (installMgs3) {
      await cp(join(__dirname, "fixtures/steam/steamapps/common/MGS3"), join(steam, "steamapps/common/MGS3"), { recursive: true });
      await writeFile(join(steam, "steamapps/appmanifest_2131650.acf"), '"AppState" { "installdir" "MGS3" "buildid" "100004" }');
    }
    app = await electron.launch({ args: [join(__dirname, "../out/main/index.js"), "--game", "mgs3"],
      env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" } });
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      const calls: unknown[] = [];
      Object.assign(globalThis, { unavailableLaunchCalls: calls });
      ipcMain.removeHandler("hub:launch");
      ipcMain.handle("hub:launch", (_event, request) => { calls.push(request); return { ok: true, value: undefined }; });
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    if (installMgs3) await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    else await expect(page.getByTestId("not-installed-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 20000 });
    return { app, page, close };
  } catch (error) { await close(); throw error; }
}

async function pressPad(page: Page, button: number) {
  await page.evaluate(async index => {
    const original = navigator.getGamepads.bind(navigator);
    const pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === index, touched: i === index, value: i === index ? 1 : 0 })) };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
    const frames = () => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    await frames();
    pad.buttons.forEach(value => { value.pressed = false; value.touched = false; value.value = 0; });
    await frames();
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: original });
  }, button);
}

async function capture(page: Page, name: string) {
  const output = join(__dirname, "out/unavailable-content");
  await mkdir(output, { recursive: true });
  for (const height of [720, 1080]) {
    await page.setViewportSize({ width: height * 16 / 9, height });
    await page.screenshot({ path: join(output, `${name}-${height}.png`) });
  }
}

test("missing games explain availability without changing the active game, music or launching", async () => {
  const { app, page, close } = await fixture(true);
  try {
    const game = page.getByTestId("game-screen"), selection = page.getByTestId("game-selection");
    await expect(game).toHaveAttribute("data-game", "mgs3");
    const audio = page.locator("#menu-music");
    await expect(audio).toHaveJSProperty("paused", false);
    const source = await audio.getAttribute("src");
    expect(source).toBeTruthy();
    await page.keyboard.press("Tab");
    const missing = page.getByTestId("tile-mgs2");
    await expect(selection.locator(".tile.not-installed")).toHaveCount(5);
    await expect(missing).toHaveAttribute("aria-disabled", "true");
    await expect(missing).toHaveClass(/not-installed/);
    await expect(missing.getByText("Not installed", { exact: true })).toBeVisible();
    await expect(page.getByTestId("tile-mgs3")).not.toHaveAttribute("aria-disabled", "true");
    await capture(page, "game-selection");
    // aria-disabled explains unavailability; activation intentionally opens the explanation.
    await missing.click({ force: true });
    const dialog = page.getByTestId("unavailable-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("This game is not installed.");
    await expect(dialog.getByRole("heading")).toContainText(/METAL GEAR SOLID 2/i);
    await expect(dialog.getByRole("button", { name: "OK", exact: true })).toBeFocused();
    await capture(page, "game-dialog");
    await expect(selection).toBeVisible();
    await expect(missing).toHaveAttribute("aria-current", "true");
    for (const key of ["ArrowDown", "ArrowRight", "PageDown", "Tab"]) await page.keyboard.press(key);
    await pressPad(page, 13);
    const background = await page.getByTestId("tile-mg12").boundingBox();
    expect(background).not.toBeNull();
    await page.mouse.move(background!.x + 4, background!.y + 4);
    await page.mouse.click(background!.x + 4, background!.y + 4);
    await expect(dialog).toBeVisible();
    await expect(missing).toHaveAttribute("aria-current", "true");
    await expect(audio).toHaveAttribute("src", source!);
    await expect(audio).toHaveJSProperty("paused", false);
    await dialog.getByRole("button", { name: "OK", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(missing).toBeFocused();
    await page.mouse.move(0, 0);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(missing).toBeFocused();
    await pressPad(page, 0);
    await expect(dialog).toBeVisible();
    await pressPad(page, 1);
    await expect(dialog).toHaveCount(0);
    await expect(missing).toHaveAttribute("aria-current", "true");
    expect(await app.evaluate(() => (globalThis as unknown as { unavailableLaunchCalls: unknown[] }).unavailableLaunchCalls)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(game).toHaveAttribute("data-game", "mgs3");
    await expect(audio).toHaveAttribute("src", source!);
  } finally { await close(); }
});

test("an empty library lists all four videos and a partial language install enables only its real video", async () => {
  const { app, page, close } = await fixture(false);
  try {
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-bonus").click();
    const videosMenu = page.getByTestId("bonus-menu-videos");
    await expect(videosMenu).toBeVisible();
    await videosMenu.click();
    const videos = page.getByTestId("bonus-videos-screen");
    const dialog = page.getByTestId("unavailable-dialog");
    await expect(videos).toBeVisible();
    await expect(videos.locator("[data-testid^=bonus-video-]")).toHaveCount(4);
    await capture(page, "empty-videos");
    for (const id of videoIds) {
      const row = page.getByTestId(`bonus-video-${id}`);
      await expect(row).toHaveAttribute("aria-disabled", "true");
      await expect(row.getByText("Not installed", { exact: true })).toBeVisible();
      await row.click({ force: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("This video is not installed.");
      await expect(dialog.getByRole("heading")).toHaveText((await row.getAttribute("aria-label"))!);
      if (id === videoIds[0]) await capture(page, "video-dialog");
      await page.keyboard.press("ArrowDown");
      await expect(row).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("bonus-chapters-screen")).toHaveCount(0);
      await expect(page.locator("video")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(row).toBeFocused();
    }
    await page.mouse.move(0, 0);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    // Arrow selection must not snap back to the previously mouse-focused row on dismissal.
    await page.keyboard.press("ArrowUp");
    const mixedInputRow = page.getByTestId("bonus-video-vol1-BD1_jp");
    await expect(mixedInputRow).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(mixedInputRow).toBeFocused();
    await expect(mixedInputRow).toHaveAttribute("aria-current", "true");
    await pressPad(page, 0);
    await expect(dialog).toBeVisible();
    await pressPad(page, 1);
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByTestId("bonus-back").click();

    const library: BonusLibrary = { volumes: [{ id: "vol1", installed: true }, { id: "vol2", installed: false }],
      artwork: {}, tracks: [], warnings: [], videos: [{ id: "vol1-BD2_jp", title: "METAL GEAR SOLID 2 BANDE DESSINÉE",
        volume: "vol1", language: "jp", url: "hub-asset://mg12/bonus-test.mp4", duration: 24, chapters: [0, 12] }] };
    await app.evaluate(({ ipcMain }, value) => {
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => ({ ok: true, value }));
    }, library);
    await page.getByTestId("tile-bonus").click();
    await videosMenu.click();
    await expect(videos.locator("[data-testid^=bonus-video-]")).toHaveCount(4);
    for (const id of videoIds.slice(0, 3)) await expect(page.getByTestId(`bonus-video-${id}`)).toHaveAttribute("aria-disabled", "true");
    const japanese = page.getByTestId("bonus-video-vol1-BD2_jp");
    await expect(japanese).not.toHaveAttribute("aria-disabled", "true");
    await japanese.click();
    await expect(page.getByTestId("bonus-chapters-screen")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: /Start from beginning/ }).click();
    const player = page.getByTestId("bonus-video-player");
    await expect(player).toBeVisible();
    await expect.poll(() => player.locator("video").evaluate(video => video.currentTime)).toBeGreaterThan(0.1);
    await expect.poll(() => player.locator("video").evaluate(video => video.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
    expect(await app.evaluate(() => (globalThis as unknown as { unavailableLaunchCalls: unknown[] }).unavailableLaunchCalls)).toEqual([]);
  } finally { await close(); }
});

test("pending and failed discovery are not described as uninstalled content", async () => {
  const { app, page, close } = await fixture(false);
  try {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => new Promise(resolve => Object.assign(globalThis, {
        failBonusDiscovery: () => resolve({ ok: false, error: "Test library read failed" }),
      })));
    });
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-bonus").click();
    const soundtrack = page.getByTestId("bonus-menu-soundtrack");
    await expect(soundtrack).toHaveAttribute("aria-busy", "true");
    await expect(soundtrack).not.toContainText("Not installed");
    await soundtrack.click({ force: true });
    const dialog = page.getByTestId("unavailable-dialog");
    await expect(dialog).toHaveCount(0);
    await app.evaluate(() => (globalThis as unknown as { failBonusDiscovery: () => void }).failBonusDiscovery());
    await expect(page.getByRole("alert")).toContainText("Test library read failed");
    await expect(soundtrack).not.toContainText("Not installed");
    await soundtrack.click();
    await expect(dialog).toContainText("The bonus library could not be read.");
    await expect(dialog).not.toContainText("not installed");
    await page.keyboard.press("Escape");
    await expect(soundtrack).toBeFocused();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => ({ ok: true, value: { volumes: [], artwork: {}, tracks: [], videos: [], warnings: [] } }));
    });
    await page.getByTestId("bonus-retry").click();
    await expect(soundtrack).toContainText("Not installed");
    await soundtrack.click({ force: true });
    await expect(dialog).toContainText("The digital soundtrack is not installed.");
  } finally { await close(); }
});
