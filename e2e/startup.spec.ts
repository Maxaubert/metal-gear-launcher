import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const launcherSettings = (volume: number) => JSON.stringify({
  keyList: ["languageLauncher", "launcherMasterVolume", "opaque"], valueList: ["1", String(volume), "preserve"],
});

async function watchSettingsLoading(page: Page) {
  return page.evaluateHandle(() => {
    const state = { seen: false };
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.textContent?.includes("Loading settings...")) state.seen = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return { state, observer };
  });
}

test("startup preloads another game's settings and warm Options preserve cached snapshots until explicit refresh", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-startup-e2e-"));
  const data = join(root, "hub");
  const steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  // Resolve every game through this disposable library, never the source fixture path.
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const launcher = join(steam, "steamapps", "common", "MGS2", "mgs2_savedata_win", "76561198000000001", "launcher");
  await mkdir(launcher, { recursive: true });
  const config = join(launcher, "launcher_sv");
  await writeFile(config, launcherSettings(10));
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mg12"], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mg12");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    // MGS2 has never been opened. Its startup snapshot must already contain volume10.
    await writeFile(config, launcherSettings(8));
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs2").click();
    const firstOpening = await watchSettingsLoading(page);
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    const volume = page.getByTestId("setting-launcherMasterVolume").locator(".volume-number");
    await expect(volume).toHaveText("10");
    expect(await firstOpening.evaluate(({ state }) => state.seen)).toBe(false);
    await firstOpening.evaluate(({ observer }) => observer.disconnect());
    await firstOpening.dispose();

    // Saving a draft from this cached revision must still detect the external change.
    await page.getByRole("button", { name: "Decrease Main Menu Volume", exact: true }).click();
    await expect(page.getByText(/Settings changed outside the hub/)).toBeVisible();
    expect(await readFile(config, "utf8")).toBe(launcherSettings(8));
    await page.getByRole("button", { name: "Use Current Settings", exact: true }).click();
    await expect(volume).toHaveText("8");
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);

    // An additional disk change distinguishes a warm cache hit from another IPC read.
    await writeFile(config, launcherSettings(6));
    const reopening = await watchSettingsLoading(page);
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    await expect(volume).toHaveText("8");
    expect(await reopening.evaluate(({ state }) => state.seen)).toBe(false);
    await reopening.evaluate(({ observer }) => observer.disconnect());
    await reopening.dispose();
    expect(await readFile(config, "utf8")).toBe(launcherSettings(6));
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

async function brokenArtworkFixture() {
  const root = await mkdtemp(join(tmpdir(), "hub-recovery-e2e-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const artwork = join(data, "assets", "mgs2", "mainVisual.png");
  const original = await readFile(artwork);
  await writeFile(artwork, "corrupt fixture image");
  return { root, data, steam, original };
}

test("keyboard Retry rediscovers a repaired artwork manifest instead of reusing the failed snapshot", async () => {
  const fixture = await brokenArtworkFixture();
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mg12"], env: {
    ...process.env, HUB_DATA_DIR: fixture.data, HUB_STEAM_ROOT: fixture.steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    const retry = page.getByRole("button", { name: "Retry preparation", exact: true });
    await expect(retry).toBeFocused({ timeout: 20000 });
    await page.keyboard.press("ArrowDown");
    await expect(retry).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(retry).toBeFocused();
    // Keep the original URL broken. Only fresh discovery sees the replacement filename.
    const manifestPath = join(fixture.data, "assets", "mgs2", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files.mainVisual = "repaired.png";
    await writeFile(join(fixture.data, "assets", "mgs2", "repaired.png"), fixture.original);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mg12");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
  } finally {
    await app.close();
    if (dirname(resolve(fixture.root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("controller recovery retries preparation and enters only after the library is ready", async () => {
  const fixture = await brokenArtworkFixture();
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
    ...process.env, HUB_DATA_DIR: fixture.data, HUB_STEAM_ROOT: fixture.steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "Retry preparation", exact: true })).toBeFocused({ timeout: 20000 });
    const pad = await page.evaluateHandle(() => {
      const pad = { index: 0, connected: true, id: "Recovery test controller", mapping: "standard", timestamp: 0,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
      return pad;
    });
    await pad.evaluate(pad => { pad.buttons[13]!.pressed = true; pad.buttons[13]!.value = 1; });
    await expect(page.getByRole("button", { name: "Retry preparation", exact: true })).toBeFocused();
    await writeFile(join(fixture.data, "assets", "mgs2", "mainVisual.png"), fixture.original);
    await pad.evaluate(pad => { pad.buttons[13]!.pressed = false; pad.buttons[13]!.value = 0; pad.buttons[0]!.pressed = true; pad.buttons[0]!.value = 1; });
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 20000 });
    await pad.evaluate(pad => { pad.buttons[0]!.pressed = false; pad.buttons[0]!.value = 0; });
    await pad.dispose();
    await expect(page.getByTestId("game-screen")).toBeVisible();
  } finally {
    await app.close();
    if (dirname(resolve(fixture.root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(fixture.root, { recursive: true, force: true });
  }
});
