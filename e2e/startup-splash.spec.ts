import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "hub-splash-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  await writeFile(join(data, "config.json"), JSON.stringify({ volume: 0.35, menuMusic: { mgs1: "mgs1-original" } }));
  return { root, data, options: { args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs1"], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } } };
}

async function clean(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
  await rm(root, { recursive: true, force: true });
}

test("fast startup holds two seconds, fades over an inert menu and preserves its mounted backdrop", async () => {
  const setup = await fixture();
  const app = await electron.launch(setup.options);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const timing = { shown: 0, exiting: 0, removed: 0, fadedIn: false };
      Object.assign(window, { splashTiming: timing });
      const watchEntrance = () => {
        const content = document.querySelector(".startup-content");
        const opacity = content ? Number(getComputedStyle(content).opacity) : 1;
        if (!timing.exiting && opacity > 0 && opacity < 1) timing.fadedIn = true;
        if (!timing.removed) requestAnimationFrame(watchEntrance);
      };
      requestAnimationFrame(watchEntrance);
      new MutationObserver(() => {
        const splash = document.querySelector('[data-testid="startup-screen"]');
        if (splash && !timing.shown) timing.shown = performance.now();
        if (splash?.getAttribute("data-exiting") === "true" && !timing.exiting) timing.exiting = performance.now();
        if (!splash && timing.shown && !timing.removed) timing.removed = performance.now();
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-exiting"] });
    });
    await page.reload();
    const splash = page.getByTestId("startup-screen");
    const content = page.getByTestId("hub-content");
    await expect(splash).toBeVisible();
    await expect(content).toHaveAttribute("inert", "");
    await expect(content).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByTestId("game-screen")).toBeVisible();
    const backdrop = await page.locator(".persistent-backdrop").elementHandle();
    const menu = await page.getByTestId("game-screen").elementHandle();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("menu-item-start")).toHaveClass(/focused/);
    await expect(page.getByTestId("game-selection")).toHaveCount(0);
    await expect.poll(() => splash.getAttribute("data-exiting"), { intervals: [20] }).toBe("true");
    await expect.poll(() => splash.evaluate(element => Number(getComputedStyle(element).opacity)), { intervals: [20] }).toBeLessThan(1);
    await expect(splash.locator(".startup-content")).toHaveCSS("opacity", "0");
    await expect(content).toHaveAttribute("inert", "");
    await expect(splash).toHaveCount(0);
    const timing = await page.evaluate(() => (window as unknown as { splashTiming: { shown: number; exiting: number; removed: number; fadedIn: boolean } }).splashTiming);
    expect(timing.fadedIn).toBe(true);
    expect(timing.exiting - timing.shown).toBeGreaterThanOrEqual(1950);
    expect(timing.removed - timing.exiting).toBeGreaterThanOrEqual(380);
    expect(await backdrop!.evaluate(element => element.isConnected)).toBe(true);
    expect(await menu!.evaluate(element => element.isConnected)).toBe(true);
    await expect(content).not.toHaveAttribute("inert");
    await expect(content).not.toHaveAttribute("aria-hidden");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("menu-item-gameSelection")).toHaveClass(/focused/);
    await expect(splash).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(splash).toBeVisible();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    expect(await splash.locator(".startup-content").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await expect(splash).toHaveCount(0);
    const reducedTiming = await page.evaluate(() => (window as unknown as { splashTiming: { shown: number; exiting: number; removed: number } }).splashTiming);
    expect(reducedTiming.exiting).toBe(0);
    expect(reducedTiming.removed - reducedTiming.shown).toBeGreaterThanOrEqual(1950);
  } finally { await app.close(); await clean(setup.root); }
});

test("splash waits for slow audio readiness and respects reduced motion", async () => {
  const setup = await fixture();
  const app = await electron.launch(setup.options);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        return new Promise<void>((resolve, reject) => {
          Object.assign(window, { releaseMusic: () => play.call(this).then(resolve, reject) });
        });
      };
    });
    await page.reload();
    const splash = page.getByTestId("startup-screen");
    await expect(splash).toBeVisible();
    await expect(splash.getByRole("heading", { name: "MGS MASTER HUB", exact: true })).toBeVisible();
    await expect(splash.getByRole("status")).toHaveText("Preparing your games");
    const logo = splash.locator(".startup-logo");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("alt", "Metal Gear Solid");
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      const bounds = await logo.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(1);
      expect(await splash.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.waitForTimeout(2200);
    await expect(splash).toHaveAttribute("data-exiting", "false");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const selector of [".startup-content", ".startup-logo", ".startup-loading-rail span"]) {
      expect(await splash.locator(selector).evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    }
    await expect.poll(() => page.evaluate(() => "releaseMusic" in window)).toBe(true);
    await page.evaluate(() => (window as unknown as { releaseMusic: () => Promise<void> }).releaseMusic());
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(splash).toHaveCount(0);
  } finally { await app.close(); await clean(setup.root); }
});

test("failed game artwork retains neutral hub branding and existing keyboard recovery", async () => {
  const setup = await fixture();
  await writeFile(join(setup.data, "assets", "mgs1", "logo.png"), "broken logo fixture");
  const app = await electron.launch(setup.options);
  try {
    const page = await app.firstWindow();
    const splash = page.getByTestId("startup-screen");
    await expect(splash.getByRole("heading", { name: "MGS MASTER HUB", exact: true })).toBeVisible();
    await expect(splash.locator(".startup-logo")).toBeVisible();
    await expect(splash.getByRole("alert")).toBeVisible();
    await expect(splash.getByRole("button", { name: "Retry", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(splash.getByRole("button", { name: "Re-extract Artwork", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(splash).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Preparing your games", exact: true })).toBeVisible();
  } finally { await app.close(); await clean(setup.root); }
});
