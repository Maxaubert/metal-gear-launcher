import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

async function pressGamepadY(page: Page) {
  await page.evaluate(async () => {
    const state = window as unknown as { testGamepadY: boolean };
    state.testGamepadY = true;
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    state.testGamepadY = false;
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
}

test("missing-artwork global shortcuts stay inert during the splash hold and exit fade", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-startup-input-"));
  const data = join(root, "hub");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  // Keep a current manifest, exercising the main menu's retry shortcut, not FirstRun.
  const manifestPath = join(data, "assets", "mgs1", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.files.mainVisual;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs1"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      Object.assign(globalThis, { testExtractRequests: [] as string[] });
      ipcMain.removeHandler("hub:extract");
      ipcMain.handle("hub:extract", (_event, game: string) => {
        (globalThis as unknown as { testExtractRequests: string[] }).testExtractRequests.push(game);
        return { ok: true, value: undefined };
      });
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      Object.assign(window, { testGamepadY: false });
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [{
        id: "Startup input fixture", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: index === 3 && (window as unknown as { testGamepadY: boolean }).testGamepadY,
          touched: false, value: index === 3 && (window as unknown as { testGamepadY: boolean }).testGamepadY ? 1 : 0,
        })),
      }] });
    });
    await page.reload();
    const splash = page.getByTestId("startup-screen");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1", { timeout: 15000 });
    await expect(page.locator(".persistent-backdrop .main-visual")).toHaveCount(0);
    await expect(splash).toHaveAttribute("data-exiting", "false");
    await page.keyboard.press("r");
    await pressGamepadY(page);
    expect(await app.evaluate(() => (globalThis as unknown as { testExtractRequests: string[] }).testExtractRequests)).toEqual([]);

    await expect.poll(() => splash.getAttribute("data-exiting"), { intervals: [20] }).toBe("true");
    await page.keyboard.press("r");
    await pressGamepadY(page);
    expect(await app.evaluate(() => (globalThis as unknown as { testExtractRequests: string[] }).testExtractRequests)).toEqual([]);

    await expect(splash).toHaveCount(0);
    await pressGamepadY(page);
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { testExtractRequests: string[] }).testExtractRequests)).toEqual(["mgs1"]);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});
