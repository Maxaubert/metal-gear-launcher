import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { SaveSettingsRequest } from "../shared/settings";

test("rapid reversal during a delayed write drains before departure and keeps accounts isolated", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-autosave-ui-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const accounts = ["76561198000000001", "76561198000000002"];
  const files: string[] = [];
  for (const [index, account] of accounts.entries()) {
    const folder = join(steam, "steamapps", "common", "MGS2", "mgs2_savedata_win", account, "launcher");
    await mkdir(folder, { recursive: true });
    files.push(join(folder, "launcher_sv"));
    await writeFile(files[index]!, JSON.stringify({ keyList: ["languageLauncher", "launcherMasterVolume", "opaque"], valueList: ["1", index ? "4" : "10", account] }));
  }
  const secondOriginal = await readFile(files[1]!);
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs2"], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 10000 });
    await app.evaluate(({ ipcMain }) => {
      // Delay the real registered transaction, including all of its revision/process guards.
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers;
      const original = handlers.get("hub:settings:save")!;
      const state = { requests: [] as SaveSettingsRequest[], release: undefined as (() => void) | undefined };
      Object.assign(globalThis, { autosaveTest: state });
      ipcMain.removeHandler("hub:settings:save");
      ipcMain.handle("hub:settings:save", async (event, request: SaveSettingsRequest) => {
        state.requests.push(request);
        if (state.requests.length === 1) await new Promise<void>(resolve => { state.release = resolve; });
        return original(event, request);
      });
    });
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Steam Account", exact: true }).click();
    await page.getByRole("button", { name: `Steam ${accounts[0]}`, exact: true }).click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    const volume = page.getByTestId("setting-launcherMasterVolume").locator(".volume-number");
    await page.getByRole("button", { name: "Decrease Main Menu Volume", exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { autosaveTest: { requests: unknown[] } }).autosaveTest.requests.length)).toBe(1);
    await page.getByRole("button", { name: "Increase Main Menu Volume", exact: true }).click();
    await expect(volume).toHaveText("10");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-screen")).toHaveAttribute("data-category", "Audio");
    await expect(page.locator(".settings-list")).toHaveAttribute("inert", "");
    await app.evaluate(() => (globalThis as unknown as { autosaveTest: { release: () => void } }).autosaveTest.release());
    await expect(page.getByRole("heading", { name: "Options", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".settings-list")).not.toHaveAttribute("inert", "");
    const requests = await app.evaluate(() => (globalThis as unknown as { autosaveTest: { requests: SaveSettingsRequest[] } }).autosaveTest.requests);
    expect(requests).toHaveLength(2);
    expect(requests.map(request => request.changes[0]?.value)).toEqual([9, 10]);
    expect(requests[0]?.revision).not.toBe(requests[1]?.revision);
    expect(requests.map(request => request.accountId)).toEqual([accounts[0], accounts[0]]);
    expect(JSON.parse(await readFile(files[0]!, "utf8")).valueList).toEqual(["1", "10", accounts[0]]);
    expect(await readFile(files[1]!)).toEqual(secondOriginal);
    await page.getByRole("button", { name: "Steam Account", exact: true }).click();
    await page.getByRole("button", { name: `Steam ${accounts[1]}`, exact: true }).click();
    await page.getByRole("button", { name: "Audio", exact: true }).click();
    await expect(volume).toHaveText("4");
    await page.getByRole("button", { name: "Increase Main Menu Volume", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Options", exact: true })).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toBeVisible();
    expect(JSON.parse(await readFile(files[1]!, "utf8")).valueList).toEqual(["1", "5", accounts[1]]);
    expect(JSON.parse(await readFile(files[0]!, "utf8")).valueList).toEqual(["1", "10", accounts[0]]);
    await expect(page.getByRole("dialog", { name: "Unsaved settings" })).toHaveCount(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
