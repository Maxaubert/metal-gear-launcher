import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { GameSettings } from "../shared/settings";

test("settings headings and row origins stay fixed across native and hub categories", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "hub-settings-layout-"));
  const data = join(root, "hub");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  const folder = join(data, "music", "mgs1");
  await mkdir(folder, { recursive: true });
  await Promise.all(Array.from({ length: 16 }, (_, index) => cp(join(data, "assets", "mgs1", "bgm.wav"),
    join(folder, `Theme ${index + 1} - A long custom filename whose full title must remain readable.wav`))));
  const gameIds = ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"] as const;
  // Keep the surface comparison independent of which native accounts and fixes are installed.
  const settings: Record<string, GameSettings> = Object.fromEntries(gameIds.map(gameId => [gameId, {
    gameId, accounts: [], revision: "0".repeat(64), sections: [
      { id: "native", title: "Game Settings", kind: "native", status: "ready", fields: [
        { id: "language", label: "Language", category: "Language", kind: "choice", value: 1,
          options: [{ label: "English", value: 1 }, { label: "Japanese", value: 2 }] },
        { id: "volume", label: "Game Volume", category: "Audio", kind: "range", value: 7, min: 0, max: 10, step: 1 },
        { id: "screen", label: "Windowed", category: "Screen", kind: "toggle", value: true },
        { id: "buttons", label: "Controller", category: "Button Settings", kind: "toggle", value: true },
      ] },
      { id: "fixture-fix", title: "Community Fix", kind: "patch", status: "ready", fields: [
        { id: "enabled", label: "Enabled", category: "General", kind: "toggle", value: true },
      ] },
    ],
  } satisfies GameSettings]));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }, fixtures) => {
      ipcMain.removeHandler("hub:settings:get");
      ipcMain.handle("hub:settings:get", (_event, request: { gameId: string }) => ({ ok: true, value: fixtures[request.gameId] }));
    }, settings);
    await page.reload();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);

    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      let baseline: { x: number; y: number; height: number; font: string; size: string; lineHeight: string; weight: string } | undefined;
      let rowOrigin: { x: number; y: number } | undefined;
      let musicBounds: { x: number; y: number; width: number; height: number } | undefined;
      for (const id of gameIds) {
        await page.keyboard.press("Tab");
        await page.getByTestId(`tile-${id}`).click();
        await page.getByTestId("menu-item-options").click();
        const overviewRows = page.locator(".settings-list .settings-row");
        await expect(overviewRows).toHaveCount(6);
        await expect(page.locator(".settings-list")).toHaveCSS("overflow-y", "visible");
        for (const row of await overviewRows.all()) await expect(row).toBeInViewport({ ratio: 1 });
        expect(await page.locator(".settings-list").evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
        for (const category of ["Language", "Audio", "Community Fixes", "Menu Music"]) {
          await page.getByRole("button", { name: category, exact: true }).click();
          const heading = page.getByRole("heading", { name: category, exact: true });
          await expect(heading).toBeVisible();
          await expect(heading.locator("img, canvas, svg")).toHaveCount(0);
          const geometry = await heading.evaluate(element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { x: rect.x, y: rect.y, height: rect.height, font: style.fontFamily, size: style.fontSize,
              lineHeight: style.lineHeight, weight: style.fontWeight };
          });
          baseline ??= geometry;
          expect(geometry, `${id} ${category} heading at ${width}`).toEqual(baseline);
          const row = page.locator(".settings-list .settings-row").first();
          const bounds = await row.boundingBox();
          if (!bounds) throw new Error(`${id} ${category} row is missing`);
          rowOrigin ??= { x: bounds.x, y: bounds.y };
          expect({ x: bounds.x, y: bounds.y }, `${id} ${category} row origin at ${width}`).toEqual(rowOrigin);
          const back = page.locator(".settings-hints");
          await expect(back.locator("img, canvas, svg")).toHaveCount(0);

          if (category === "Menu Music") {
            musicBounds ??= bounds;
            expect(bounds, `${id} music row bounds with different list lengths at ${width}`).toEqual(musicBounds);
            await expect(page.locator(".settings-list")).toHaveCSS("scrollbar-gutter", "stable");
            await expect(page.locator(".settings-list")).toHaveCSS("overflow-y", "auto");
            if (id === "mgs1") {
              expect(await page.locator(".settings-list").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
            }
          }
          await page.keyboard.press("Escape");
        }
        await page.keyboard.press("Escape");
      }
    }
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
