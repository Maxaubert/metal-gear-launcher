import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("individual trophies show source percentages and unlock state, navigate completely, refresh and preserve the backdrop", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-trophies-")), data = join(root, "hub");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs2"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 15000 });
    const invalid = await page.evaluate(() => window.hub.getAchievements({ gameId: "../invalid" as never }));
    expect(invalid.ok).toBe(false);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:achievements:get");
      let calls = 0;
      ipcMain.handle("hub:achievements:get", (_event, request) => {
        calls++;
        const achievements = Array.from({ length: 12 }, (_, i) => ({ id: `trophy-${i}`, name: `Trophy ${i + 1}`, description: `Description for trophy ${i + 1}.`, unlocked: i === 0 ? true : i === 1 ? false : null,
          percent: i === 0 ? 0 : i === 1 ? .04 : i === 2 ? null : 45.8, hidden: false }));
        return { ok: true, value: { gameId: request.gameId, sources: [{ id: "steam:2131640", platform: "steam", label: "Steam", status: "ready", personalStatus: "available", updatedAt: 1700000000000,
          stale: calls > 1, message: calls > 1 ? "Showing cached trophies." : undefined, achievements },
          { id: "gog:1", platform: "gog", label: "GOG Galaxy", status: "ready", personalStatus: "unavailable", updatedAt: 1700000000000, stale: true,
            achievements: [{ ...achievements[0], name: "Galaxy Trophy", unlocked: null, percent: 34.88 }] }] } };
      });
    });
    const backdrop = await page.locator(".persistent-backdrop").elementHandle();
    await page.getByTestId("menu-item-trophies").click();
    const screen = page.getByTestId("trophies-screen");
    await expect(screen).toBeVisible();
    await expect(screen.locator(".trophy-row")).toHaveCount(12);
    await expect(screen.locator(".trophy-row").nth(0)).toContainText("0%");
    await expect(screen.locator(".trophy-row").nth(1)).toContainText("<0.1%");
    await expect(screen.locator(".trophy-row").nth(2)).toContainText("Unavailable");
    await page.mouse.move(0, 0);
    for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowDown");
    await expect(screen.locator(".trophy-row").last()).toHaveAttribute("aria-current", "true");
    await expect(screen.getByRole("complementary")).toContainText("Description for trophy 12.");
    const visible = await screen.locator(".trophy-row").last().evaluate(el => {
      const row = el.getBoundingClientRect(), list = el.parentElement!.getBoundingClientRect(); return row.top >= list.top && row.bottom <= list.bottom + 1;
    });
    expect(visible).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(screen.locator(".trophy-row")).toHaveCount(1);
    await expect(screen.getByRole("complementary")).toContainText("GOG players earned this trophy");
    await expect(screen.locator(".trophy-row")).toContainText("34.9%");
    await page.keyboard.press("ArrowLeft");
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      expect(await screen.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const hints = await screen.locator(".hints").boundingBox();
      expect(hints!.x).toBeGreaterThanOrEqual(0);
      expect(hints!.x + hints!.width).toBeLessThanOrEqual(width);
    }
    await screen.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(screen).toContainText("Showing cached trophies.");
    await page.keyboard.press("Escape");
    await expect(screen).toHaveCount(0);
    expect(await backdrop!.evaluate(el => el.isConnected)).toBe(true);
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.getByTestId("menu-item-trophies").click();
    await screen.getByRole("button", { name: "Back", exact: true }).click();
    await expect(screen).toHaveCount(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected fixture path");
    await rm(root, { recursive: true, force: true });
  }
});
