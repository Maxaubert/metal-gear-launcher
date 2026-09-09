import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("installed soundtracks play on startup and preview through the strict media protocol", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-native-music-e2e-"));
  await cp(join(__dirname, "fixtures/assets"), join(root, "assets"), { recursive: true });
  await writeFile(join(root, "config.json"), JSON.stringify({ volume: 0.6 }));
  const app = await electron.launch({ args: [join(__dirname, "../out/main/index.js"), "--game", "mgs3"],
    env: { ...process.env, HUB_DATA_DIR: root, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" } });
  try {
    const page = await app.firstWindow();
    const urls = [`hub-bonus://media/${"a".repeat(64)}`, `hub-bonus://media/${"b".repeat(64)}`];
    await app.evaluate(async ({ ipcMain, protocol, net }, { urls, fixture }) => {
      await protocol.unhandle("hub-bonus");
      protocol.handle("hub-bonus", request => urls.includes(request.url) ? net.fetch(fixture) : new Response(null, { status: 404 }));
      ipcMain.removeHandler("hub:music:get");
      ipcMain.handle("hub:music:get", (_event, gameId: string) => ({ ok: true, value: {
        gameId, folderPath: "", defaultThemeId: `${gameId}-file-${"a".repeat(64)}`,
        themes: gameId === "mgs3" ? ["Snake Eater", "Operation Snake Eater"].map((label, index) => ({
          id: `${gameId}-file-${(index ? "b" : "a").repeat(64)}`, label, url: urls[index],
        })) : [],
      } }));
    }, { urls, fixture: pathToFileURL(join(root, "assets/mgs3/bgm.wav")).href });
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator("#menu-music")).toHaveAttribute("src", urls[0]!);
    await expect.poll(() => page.locator("#menu-music").evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.1);
    await expect(page.locator("#menu-music")).toHaveJSProperty("volume", 0.75);
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await page.getByRole("button", { name: "Operation Snake Eater", exact: true }).hover();
    await expect(page.locator("#menu-music")).toHaveAttribute("src", urls[1]!);
    await expect(page.locator("#menu-music")).toHaveJSProperty("paused", false);
    await expect(page.locator("#menu-music")).toHaveJSProperty("volume", 0.75);
    await page.keyboard.press("Escape");
    await expect(page.locator("#menu-music")).toHaveAttribute("src", urls[0]!);
    await expect(page.locator("#menu-music")).toHaveJSProperty("paused", false);
    expect(JSON.parse(await readFile(join(root, "config.json"), "utf8")).volume).toBe(0.6);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
