import { test, expect, _electron as electron } from "@playwright/test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("selection motion is interruptible, keeps rows fixed, and respects reduced motion", async () => {
  const data = mkdtempSync(join(tmpdir(), "hub-motion-"));
  cpSync(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
  const app = await electron.launch({
    args: [join(__dirname, "../out/main/index.js")],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"), HUB_FAKE_LAUNCH: "1", HUB_WINDOWED: "1" },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    for (const size of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
      await page.setViewportSize(size);
      const before = await page.locator(".tile").evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }));
      await page.keyboard.press("ArrowDown");
      await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
      const after = await page.locator(".tile").evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }));
      expect(after).toEqual(before);
      const tile = await page.locator(".tile.focused").boundingBox();
      await expect.poll(async () => {
        const marker = await page.locator(".selection-marker").boundingBox();
        return Math.abs(marker!.y - tile!.y);
      }).toBeLessThan(1);
    }

    // Hold an actual in-flight reveal, then replace it with a new selection.
    await page.keyboard.press("ArrowDown");
    const held = await page.getByTestId("scene-backdrop").evaluate(node => {
      const animations = node.getAnimations();
      animations.forEach(animation => { animation.pause(); animation.currentTime = 120; });
      return animations.length;
    });
    expect(held).toBe(1);
    const interrupted = await page.getByTestId("scene-backdrop").elementHandle();
    const visibleClip = await interrupted!.evaluate(node => getComputedStyle(node).clipPath);
    await page.keyboard.press("ArrowDown");
    expect(await interrupted!.evaluate(node => getComputedStyle(node).clipPath)).toBe(visibleClip);
    expect(await interrupted!.evaluate(node => node.getAttribute("data-testid"))).toBe("outgoing-scene");
    await expect(page.getByTestId("tile-mgs4")).toHaveAttribute("data-focused", "true");
    await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
    await expect(page.getByTestId("scene-backdrop")).toHaveAttribute("data-game", "mgs4");
    await expect(page.locator(".tile.focused .tile-number")).not.toHaveCSS("color", "rgb(0, 0, 0)");
    await page.getByTestId("tile-mgs1").hover();
    await expect(page.getByTestId("tile-mgs1")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
    expect(await page.getByTestId("scene-backdrop").evaluate(node => node.getAnimations().length)).toBe(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("tile-mgs2")).toHaveAttribute("data-focused", "true");
    await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
    await expect(page.locator(".selection-marker")).toHaveCSS("transition-duration", "0s");
    expect(await page.getByTestId("scene-backdrop").evaluate(node => node.getAnimations().length)).toBe(0);
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    rmSync(data, { recursive: true, force: true });
  }
});
