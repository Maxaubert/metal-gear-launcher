import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import sharp from "sharp";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("Options preserves MG artwork and game scenes omit decorative timeline dates", async ({}, testInfo) => {
  test.setTimeout(90_000);
  const data = await mkdtemp(join(tmpdir(), "hub-settings-backdrop-"));
  await cp(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
  const app = await electron.launch({
    args: [join(__dirname, "../out/main/index.js"), "--game", "mg12"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"),
      HUB_FAKE_LAUNCH: "1", HUB_WINDOWED: "1" },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 30_000 });
    const scene = page.getByTestId("scene-backdrop");
    for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
      await page.keyboard.press("Tab");
      await page.getByTestId(`tile-${id}`).click();
      await expect(scene).toHaveAttribute("data-game", id);
      await expect(scene.locator(".ghost-timeline")).toHaveCount(0);
      await expect(scene.locator(".year").first()).toBeVisible();
      if (id !== "mgspw") await expect(scene.locator(".ghost-number")).toBeVisible();
      // Stop before the incident header ticks; those legitimately move in Options.
      const left = { x: 0, y: 0, width: 1160, height: 1080 };
      const before = id === "mg12" ? await page.screenshot({ clip: left, animations: "disabled" }) : undefined;
      await page.getByTestId("menu-item-options").click();
      await expect(scene).toHaveAttribute("data-view", "settings");
      await expect(scene.locator(".ghost-timeline")).toHaveCount(0);
      if (id === "mgs1") {
        await expect(scene.locator(".settings-year-subtitle")).toBeVisible();
        await expect(scene.locator(".settings-header-rule")).toBeVisible();
        await expect(scene.locator(".settings-header-rule")).toHaveAttribute("viewBox", "0 335 760 127");
      }
      if (id === "mg12") {
        await expect(scene.locator(".mg12-settings-grid, .mg12-settings-grid-backing")).toHaveCount(0);
        const after = await page.screenshot({ clip: left, animations: "disabled" });
        await testInfo.attach("main-art", { body: before!, contentType: "image/png" });
        await testInfo.attach("options-art", { body: after, contentType: "image/png" });
        const oldPixels = await sharp(before!).raw().toBuffer();
        const newPixels = await sharp(after).raw().toBuffer();
        expect(newPixels.equals(oldPixels), "Entering Options must not repaint MG artwork").toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(scene).toHaveAttribute("data-view", "main");
      if (id === "mg12") {
        expect((await page.screenshot({ clip: left, animations: "disabled" })).equals(before!), "Leaving Options must not repaint MG artwork").toBe(true);
      }
    }
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(data, { recursive: true, force: true });
  }
});
