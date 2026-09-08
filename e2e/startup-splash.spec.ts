import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

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

test("splash holds for real audio readiness, fits extracted portrait branding, and respects reduced motion", async () => {
  const setup = await fixture();
  // Handmade vertical artwork exercises the source orientation without shipping game assets.
  await sharp({ create: { width: 100, height: 400, channels: 4, background: "#e50019" } }).png()
    .toFile(join(setup.data, "assets", "mgs1", "logo.png"));
  const app = await electron.launch(setup.options);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
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
    await expect(logo).toHaveAttribute("data-portrait", "true");
    const bounds = await logo.boundingBox();
    expect(bounds!.width / bounds!.height).toBeCloseTo(4, 1);
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

test("failed logo retains readable hub branding and existing keyboard recovery", async () => {
  const setup = await fixture();
  await writeFile(join(setup.data, "assets", "mgs1", "logo.png"), "broken logo fixture");
  const app = await electron.launch(setup.options);
  try {
    const page = await app.firstWindow();
    const splash = page.getByTestId("startup-screen");
    await expect(splash.getByRole("heading", { name: "MGS MASTER HUB", exact: true })).toBeVisible();
    await expect(splash.locator(".startup-brand-fallback")).toBeVisible();
    await expect(splash.locator(".startup-logo")).toHaveCount(0);
    await expect(splash.getByRole("alert")).toBeVisible();
    await expect(splash.getByRole("button", { name: "Retry", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(splash.getByRole("button", { name: "Re-extract Artwork", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Preparing your games", exact: true })).toBeVisible();
  } finally { await app.close(); await clean(setup.root); }
});
