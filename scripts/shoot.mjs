// Real-asset visual QA capture (round 8 rewrite - see docs/superpowers/specs, section 4.7's
// history and .superpowers/sdd/2026-09-06-mvp-hub/critique-round-1-results.md finding B).
//
// The previous mechanism launched the built app directly (`electron-vite preview`) with
// `HUB_SHOOT` set, requested a 3840x2160 `BrowserWindow`, and captured with
// `webContents.capturePage()`. On this machine (225% display scaling) Windows silently clamped
// that on-screen window to the desktop's work area, so captures came out 3843x2052 (aspect
// 1.873) instead of the requested 16:9 - and since the whole layout is expressed in vh/vw, a
// short canvas shifts every vertical position the layout computes, invalidating any comparison
// made against it. Switching the *window* to `offscreen: true` didn't fully fix it either
// (measured 3846x2055) - Electron's own offscreen renderer still not immune to platform DPI/size
// quirks on this machine.
//
// Playwright's CDP-driven viewport does not have this problem: `page.setViewportSize` and
// `page.screenshot()` are already proven exact in this repo's own e2e suite (`e2e/hub.spec.ts`'s
// "screenshots every game at 4k" test, run against fixture assets). This script drives the same
// real app (`out/main/index.js`) the same way, but against the user's own real `%LOCALAPPDATA%`
// asset cache and real Steam install (no `HUB_DATA_DIR`/`HUB_STEAM_ROOT` override), navigating
// through the actual UI instead of the old IPC shortcut, and asserts the captured buffer is
// exactly 3840x2160 before writing each file.
import { _electron as electron } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "e2e", "out", process.env.HUB_CAPTURE_ROUND || "real");
const PACK_ORDER = ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"];

async function assertSize(buf, label) {
  const { width, height } = await sharp(buf).metadata();
  if (width !== 3840 || height !== 2160) {
    throw new Error(`shoot: ${label} captured at ${width}x${height}, expected 3840x2160`);
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const launchOptions = {
    args: [join(root, "out", "main", "index.js")],
    // HUB_WINDOWED keeps the real window out of OS fullscreen so Playwright's CDP viewport
    // controls the actual content size, the same trick e2e/hub.spec.ts uses for its own 4k
    // screenshot test. HUB_DATA_DIR/HUB_STEAM_ROOT are intentionally left unset - this targets
    // the real %LOCALAPPDATA% asset cache and the real Steam install, not e2e's fixtures.
    env: { ...process.env, HUB_WINDOWED: "1" },
  };
  let app = await electron.launch(launchOptions);
  try {
    let page = await app.firstWindow();
    if (process.env.HUB_REFRESH_ASSETS) {
      for (const id of process.env.HUB_REFRESH_ASSETS.split(",")) {
        console.log(`extracting ${id}`);
        const result = await page.evaluate((gameId) => window.hub.extract(gameId), id);
        if (!result.ok) throw new Error(`extract ${id}: ${result.error}`);
        const failed = result.value.games.find((game) => game.pack.id === id)?.assets?.failed;
        if (failed && Object.keys(failed).length) throw new Error(`extract ${id}: ${JSON.stringify(failed)}`);
      }
      // The open renderer may have cached an image while extraction replaced it.
      // Review the finished files in a fresh renderer, as the installed app will.
      await app.close();
      app = await electron.launch(launchOptions);
      page = await app.firstWindow();
    }
    await page.setViewportSize({ width: 3840, height: 2160 });
    console.log("waiting for the first game screen to load...");
    await page.getByTestId("game-screen").waitFor({ state: "visible", timeout: 60_000 });
    console.log("loaded, starting capture loop");

    for (const id of PACK_ORDER) {
      console.log(`-> ${id}`);
      await page.keyboard.press("Tab");
      await page.getByTestId("game-selection").waitFor({ state: "visible" });
      await page.getByTestId(`tile-${id}`).click();
      await page.locator(`[data-testid="game-screen"][data-game="${id}"]`).waitFor({ state: "visible" });
      await page.locator("img").evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900); // let the 250ms crossfade settle
      const buf = await page.screenshot();
      await assertSize(buf, id);
      await writeFile(join(outDir, `${id}.png`), buf);
      if (["mg12", "mgs2", "mgs3", "mgs4", "mgspw"].includes(id)) {
        await page.keyboard.press("Tab");
        await page.getByTestId("game-selection").waitFor({ state: "visible" });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(outDir, `selection-${id}.png`) });
        await page.keyboard.press("Escape");
      }
    }

    console.log("-> selection");
    await page.keyboard.press("Tab");
    await page.getByTestId("game-selection").waitFor({ state: "visible" });
    await page.waitForTimeout(900);
    const selectionBuf = await page.screenshot();
    await assertSize(selectionBuf, "selection");
    await writeFile(join(outDir, "selection.png"), selectionBuf);
    console.log("done");

  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
