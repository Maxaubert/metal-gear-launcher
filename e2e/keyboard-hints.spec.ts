import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("keyboard keycaps replace controller circles across main, selection and settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-keycaps-")), data = join(root, "hub");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs2"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 15000 });
    await expect(page.locator("kbd", { hasText: "Esc" })).toBeVisible();
    await expect(page.locator(".control-gamepad")).toHaveCount(0);
    const key = await page.locator("kbd", { hasText: "Esc" }).evaluate(el => ({ height: el.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(el).borderRadius) }));
    expect(key.radius).toBeLessThan(key.height / 3);
    await page.evaluate(() => {
      const pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 13, touched: i === 13, value: i === 13 ? 1 : 0 })) };
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
    });
    await expect(page.locator(".control-gamepad")).toHaveCount(3);
    await page.evaluate(() => Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] }));
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("kbd", { hasText: "Esc" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("game-selection").locator("kbd", { hasText: "Enter" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("menu-item-options").click();
    const settings = page.getByTestId("settings-screen");
    await expect(settings.locator("kbd", { hasText: "Esc" })).toBeVisible();
    await expect(settings.getByRole("button", { name: /^(Back|Save Changes|Reload)$/ })).toHaveCount(0);
    await settings.getByRole("button", { name: "Menu Music", exact: true }).click();
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      const hints = await settings.locator(".settings-hints").boundingBox();
      expect(hints!.x).toBeGreaterThanOrEqual(0);
      expect(hints!.x + hints!.width).toBeLessThanOrEqual(width);
      expect(hints!.y + hints!.height).toBeLessThanOrEqual(width * 9 / 16);
    }
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected fixture path");
    await rm(root, { recursive: true, force: true });
  }
});
