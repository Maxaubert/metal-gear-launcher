import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("Menu Music saves and discards hub-only preferences without native settings or accounts", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-menu-music-e2e-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await writeFile(join(data, "config.json"), JSON.stringify({ volume: 0.7 }));
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const manifestPath = join(data, "assets", "mg12", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.files.bgm;
  await writeFile(manifestPath, JSON.stringify(manifest));
  const launcherDir = join(steam, "steamapps", "common", "MGS3", "mgs3_savedata_win", "76561198000000001", "launcher");
  await mkdir(launcherDir, { recursive: true });
  const nativeConfig = join(launcherDir, "launcher_sv");
  const nativeBytes = JSON.stringify({ keyList: ["languageLauncher", "launcherMasterVolume"], valueList: ["1", "10"] });
  await writeFile(nativeConfig, nativeBytes);
  const originalFiles = await readdir(steam, { recursive: true });
  const options = { args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs2"], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } };
  let app = await electron.launch(options);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    // A music-only save must never depend on the native transaction API.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:settings:save");
      ipcMain.handle("hub:settings:save", () => ({ ok: false, error: "Native save must not be called for menu music." }));
    });
    await page.getByTestId("menu-item-options").click();
    await expect(page.getByRole("button", { name: "Steam Account", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    const theme = page.getByRole("button", { name: "Original Menu Theme", exact: true });
    await theme.click();
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toHaveCount(0);
    expect(JSON.parse(await readFile(join(data, "config.json"), "utf8")).menuMusic).toBeUndefined();
    await theme.click();
    await page.keyboard.press("Tab");
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    expect(JSON.parse(await readFile(join(data, "config.json"), "utf8")).menuMusic).toEqual({ mgs2: "mgs2-original" });
    const invalid = await page.evaluate(() => window.hub.saveMenuMusic({ gameId: "mgs2", themeId: "mgs3-original" }));
    expect(invalid.ok).toBe(false);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs3").click();
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    await page.getByRole("button", { name: "Decrease Main Menu Volume", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await page.getByRole("button", { name: "Original Menu Theme", exact: true }).click();
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    await expect(page.getByTestId("setting-launcherMasterVolume").locator(".volume-number")).toHaveText("9");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await page.getByRole("button", { name: "Original Menu Theme", exact: true }).click();
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    expect(JSON.parse(await readFile(join(data, "config.json"), "utf8")).menuMusic).toEqual({ mgs2: "mgs2-original", mgs3: "mgs3-original" });
    expect(await readFile(nativeConfig, "utf8")).toBe(nativeBytes);
    expect(await readdir(steam, { recursive: true })).toEqual(originalFiles);
    await page.keyboard.press("Escape");
    // Saving music leaves the independent native draft available to discard.
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    await expect(page.getByText("Loading settings...", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Discard Changes", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mg12").click();
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await expect(page.getByText(/No menu music is available/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Original Menu Theme", exact: true })).toHaveCount(0);
    await app.close();
    app = await electron.launch(options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await page.getByRole("button", { name: "Original Menu Theme", exact: true }).click();
    // Selecting the already persisted preference is clean after a full app restart.
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toHaveCount(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
