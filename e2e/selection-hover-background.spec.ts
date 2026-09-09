import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

test("mouse selection keeps the painted background after wipes and entering another game", async () => {
  const data = await mkdtemp(join(tmpdir(), "hub-selection-hover-"));
  await cp(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
  const app = await electron.launch({
    args: [join(__dirname, "../out/main/index.js"), "--game", "mgs1"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"), HUB_FAKE_LAUNCH: "1", HUB_WINDOWED: "1" },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    const logoPixel = await sharp(join(data, "assets/mgs1/logo.png")).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    async function expectPainted(game: string) {
      const scene = page.getByTestId("scene-backdrop");
      await expect(scene).toHaveAttribute("data-game", game);
      await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
      await expect(scene).toHaveCSS("clip-path", "none");
      expect(await scene.evaluate(node => node.getAnimations().length)).toBe(0);
      // The fixture logo covers this point for MGS1/2/3. DOM visibility alone
      // misses a full-size backdrop hidden by an orphaned clip animation.
      const screenshot = await page.screenshot();
      expect(await sharp(screenshot).extract({ left: 576, top: 540, width: 1, height: 1 }).removeAlpha().raw().toBuffer()).toEqual(logoPixel);
    }

    for (let round = 0; round < 3; round++) {
      await page.getByTestId("menu-item-gameSelection").click();
      await page.getByTestId("tile-mgs2").hover();
      await expectPainted("mgs2");
      // Keeping the pointer on the same tile must not create another reveal.
      const tile = await page.getByTestId("tile-mgs2").boundingBox();
      await page.mouse.move(tile!.x + 40, tile!.y + 30);
      await expectPainted("mgs2");
      // Interrupt one wipe with another before its deadline.
      await page.getByTestId("tile-mgs1").hover();
      await page.getByTestId("tile-mgs3").hover();
      await expectPainted("mgs3");
      await page.getByTestId("tile-mgs3").click();
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
      await expectPainted("mgs3");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("menu-item-gameSelection").click();
    await page.getByTestId("tile-mgs1").hover();
    await expectPainted("mgs1");
    await page.keyboard.press("Escape");
    await expectPainted("mgs3");
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(data, { recursive: true, force: true });
  }
});
