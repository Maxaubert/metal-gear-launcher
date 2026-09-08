import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("music filenames preview on focus, save explicitly, and refresh without restarting", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-music-library-ui-"));
  const data = join(root, "hub");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  const folder = join(data, "music", "mgs1");
  await mkdir(folder, { recursive: true });
  const silent = join(data, "assets", "mgs1", "bgm.wav");
  const labels = Array.from({ length: 12 }, (_, index) => `Theme ${String(index + 1).padStart(2, "0")} - Evening at Shadow Moses`);
  await Promise.all(labels.map(label => cp(silent, join(folder, `${label}.wav`))));
  const options = {
    args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs1"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"), HUB_FAKE_LAUNCH: "1", HUB_WINDOWED: "1" },
  };
  let app = await electron.launch(options);
  try {
    let page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    const library = await page.evaluate(() => window.hub.getMenuMusic("mgs1"));
    if (!library.ok) throw new Error(library.error);
    const firstId = library.value.themes.find(theme => theme.label === labels[0])!.id;
    const secondId = library.value.themes.find(theme => theme.label === labels[1])!.id;
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    const first = page.getByRole("button", { name: labels[0], exact: true });
    await first.hover();
    await expect(page.locator("#menu-music")).toHaveAttribute("src", new RegExp(firstId), { timeout: 1000 });
    await expect(first.locator(".settings-selected")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toHaveCount(0);
    await expect(first.locator("canvas, img")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#menu-music")).toHaveAttribute("src", new RegExp(secondId), { timeout: 1000 });
    await page.keyboard.press("Escape");
    await expect(page.locator("#menu-music")).toHaveAttribute("src", /mgs1\/bgm\.wav/);
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await first.click();
    await page.getByRole("button", { name: labels[1], exact: true }).hover();
    await expect(page.locator("#menu-music")).toHaveAttribute("src", new RegExp(secondId));
    await page.getByRole("button", { name: "Discard Changes", exact: true }).click();
    await expect(page.locator("#menu-music")).toHaveAttribute("src", /mgs1\/bgm\.wav/);
    const last = page.getByRole("button", { name: labels[11], exact: true });
    await last.hover();
    await expect(last).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(last.locator(".settings-selected")).toBeVisible();
    await first.hover();
    await expect(page.locator("#menu-music")).toHaveAttribute("src", new RegExp(firstId));
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    const lastId = library.value.themes.find(theme => theme.label === labels[11])!.id;
    await expect(page.locator("#menu-music")).toHaveAttribute("src", new RegExp(lastId));
    expect(JSON.parse(await readFile(join(data, "config.json"), "utf8")).menuMusic.mgs1).toBe(lastId);

    const addedLabel = "新しい夜 - Guitar Theme";
    await cp(silent, join(folder, `${addedLabel}.wav`));
    await page.getByRole("button", { name: "Refresh Music", exact: true }).click();
    await expect(page.getByRole("button", { name: addedLabel, exact: true })).toBeAttached();
    await expect(page.getByText("Music library refreshed.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Music Folder", exact: true })).toBeVisible();

    await app.close();
    app = await electron.launch(options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await expect(page.locator("#menu-music")).toHaveAttribute("src", new RegExp(lastId));
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await expect(page.getByRole("button", { name: labels[11], exact: true }).locator(".settings-selected")).toBeVisible();
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
