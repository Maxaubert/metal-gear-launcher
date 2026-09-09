import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { usersvCrc16, decodeUsersv } from "../electron/main/settings/usersv";

const account = "76561198000000001";

function syntheticSettings() {
  const plain = Buffer.alloc(4096);
  plain.write("MGSS");
  plain.writeUInt32LE(5, 12);
  plain.writeInt32LE(2, 24);
  plain.writeInt32LE(8, 28);
  plain.writeInt32LE(777, 416);
  plain.writeUInt16LE(usersvCrc16(plain.subarray(16)), 4);
  const encrypted = Buffer.from(plain);
  for (let offset = 0; offset < 4096; offset += 4) {
    if (offset === 12) continue;
    const ordinal = offset < 12 ? offset / 4 : offset / 4 - 1;
    encrypted.writeUInt32LE((plain.readUInt32LE(offset) ^ Math.imul(ordinal % 512, 0x1020304)) >>> 0, offset);
  }
  return encrypted;
}

test("settings autosave, queued departure, conflicts and keyboard navigation preserve game data", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-settings-e2e-"));
  const data = join(root, "hub");
  const steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const launcher = join(steam, "steamapps", "common", "MGS3", "mgs3_savedata_win", account, "launcher");
  await mkdir(launcher, { recursive: true });
  await writeFile(join(launcher, "usersv"), syntheticSettings());
  await writeFile(join(launcher, "launcher_sv"), JSON.stringify({ keyList: ["languageLauncher", "opaque"], valueList: ["1", "keep"] }));
  const mg12Launcher = join(steam, "steamapps", "common", "MG and MG2", "mg12_savedata_win", account, "launcher");
  await mkdir(mg12Launcher, { recursive: true });
  await writeFile(join(mg12Launcher, "usersv"), syntheticSettings());
  await writeFile(join(mg12Launcher, "launcher_sv"), JSON.stringify({ keyList: ["languageLauncher"], valueList: ["1"] }));
  const mgs2Launcher = join(steam, "steamapps", "common", "MGS2", "mgs2_savedata_win", account, "launcher");
  await mkdir(mgs2Launcher, { recursive: true });
  const mgs2Game = syntheticSettings();
  const mgs2Json = JSON.stringify({ keyList: ["languageLauncher", "HiresoPreset", "HiresoMovie"], valueList: ["1", "0", "1"] });
  await writeFile(join(mgs2Launcher, "usersv"), mgs2Game);
  await writeFile(join(mgs2Launcher, "launcher_sv"), mgs2Json);
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await page.getByTestId("game-screen").waitFor();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs3").click();
    await page.getByTestId("menu-item-options").click();
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await expect(page.getByText("Loading settings...", { exact: true })).toHaveCount(0);
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      await expect(page.getByRole("button", { name: "Language", exact: true })).toBeInViewport({ ratio: 1 });
      const selected = page.locator('.settings-row[data-focused="true"]').first();
      await expect(selected).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^(Back|Save Changes|Reload|Discard Changes)$/ })).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.send("hub:selectGame", "mgs2");
    });
    await expect(page.getByTestId("settings-screen")).toHaveAttribute("data-game", "mgs3");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Options", exact: true })).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByRole("dialog", { name: "Unsaved settings" })).toHaveCount(0);
    const json = JSON.parse(await readFile(join(launcher, "launcher_sv"), "utf8"));
    expect(json.valueList).toEqual(["2", "keep"]);
    expect(await readdir(join(data, "settings-backups", "mgs3"))).toHaveLength(1);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs3").click();
    await page.getByTestId("menu-item-options").click();

    const audio = page.getByRole("button", { name: /^(Audio|Sound)$/ });
    await audio.click();
    await page.getByRole("button", { name: "Increase Game Volume", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible({ timeout: 15000 });
    const decoded = decodeUsersv(await readFile(join(launcher, "usersv")));
    expect(decoded.readInt32LE(28)).toBe(9);
    expect(decoded.readInt32LE(416)).toBe(777);

    await writeFile(join(launcher, "launcher_sv"), JSON.stringify({ ...json, external: true }));
    await page.getByRole("button", { name: "Decrease Game Volume", exact: true }).click();
    await expect(page.getByText(/Settings changed outside the hub/)).toBeVisible();
    expect(decodeUsersv(await readFile(join(launcher, "usersv"))).readInt32LE(28)).toBe(9);
    await page.getByRole("button", { name: "Use Current Settings", exact: true }).click();
    await expect(page.getByRole("button", { name: "Use Current Settings", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs2").click();
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Screen", exact: true }).click();
    const preset = page.getByTestId("setting-HiresoPreset").locator("output");
    const movie = page.getByTestId("setting-HiresoMovie").locator("output");
    await expect(preset).toHaveText("Original Mode");
    await expect(page.getByRole("button", { name: "Increase Movie", exact: true })).toBeEnabled();
    await page.getByTestId("setting-HiresoMovie").hover();
    await expect(page.locator(".settings-side-help")).toContainText("Changing this setting selects Custom.");
    await page.getByRole("button", { name: "Increase Movie", exact: true }).click();
    await expect(preset).toHaveText("Custom");
    await expect(movie).toHaveText("High Resolution");
    await expect(page.getByTestId("setting-HiresoUpScale").locator("output")).toHaveText("Default");
    // Returning to the raw Original value must not restore remembered Custom movie=1.
    await page.getByRole("button", { name: "Increase Movie", exact: true }).click();
    await expect(movie).toHaveText("Original");
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(preset).toHaveText("Custom");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Screen", exact: true }).click();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("setting-HiresoMovie")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowRight");
    await expect(preset).toHaveText("Custom");
    await expect(movie).toHaveText("High Resolution");
    // Returning to Original saves the displayed mode while remembering the Custom edit.
    await expect(preset).toHaveText("Custom");
    await page.getByRole("button", { name: "Increase Resolution Settings", exact: true }).click();
    await expect(preset).toHaveText("Original Mode");
    await expect(movie).toHaveText("Original");
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible({ timeout: 15000 });
    const savedMgs2 = JSON.parse(await readFile(join(mgs2Launcher, "launcher_sv"), "utf8"));
    expect(savedMgs2.valueList[savedMgs2.keyList.indexOf("HiresoPreset")]).toBe("0");
    expect(savedMgs2.valueList[savedMgs2.keyList.indexOf("HiresoMovie")]).toBe("1");
    expect(decodeUsersv(await readFile(join(mgs2Launcher, "usersv"))).readInt32LE(68)).toBe(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mg12").click();
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Screen", exact: true }).click();
    const preview = page.getByRole("img", { name: /Display area/ });
    await expect(preview).toHaveAccessibleName("Display area center, wallpaper off");
    await page.getByRole("button", { name: "Increase Display Area", exact: true }).click();
    await page.getByRole("button", { name: "Increase Wallpaper", exact: true }).click();
    await expect(preview).toHaveAccessibleName("Display area right, wallpaper 1");
    await expect(preview.locator(".mg12-screen-preview-wallpaper")).toHaveJSProperty("complete", true);
    await expect(preview.locator(".mg12-screen-preview-wallpaper")).not.toHaveJSProperty("naturalWidth", 0);
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Restore Defaults", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(preview).toHaveAccessibleName("Display area center, wallpaper 1");
    const mg12Saved = decodeUsersv(await readFile(join(mg12Launcher, "usersv")));
    expect(mg12Saved.readInt32LE(16)).toBe(1);
    expect(mg12Saved.readInt32LE(20)).toBe(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
