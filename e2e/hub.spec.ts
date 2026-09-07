/* eslint-disable @typescript-eslint/no-explicit-any -- `page` is stashed with a custom `dataDir`
   property for the launch-log assertion below; casting through `any` is the brief's own approach
   (mirrors tests/launch/launcher.test.ts's fake-child casts) rather than extending Playwright's Page type. */
import { test, expect, _electron as electron } from "@playwright/test";
import { join } from "node:path";
import { mkdtempSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

test.describe("hub", () => {
  let app: Awaited<ReturnType<typeof electron.launch>>;
  let page: Awaited<ReturnType<typeof app.firstWindow>>;

  test.beforeAll(async () => {
    const data = mkdtempSync(join(tmpdir(), "hub-e2e-"));
    cpSync(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
    app = await electron.launch({
      args: [join(__dirname, "..", "out", "main", "index.js")],
      env: {
        ...process.env,
        HUB_DATA_DIR: data,
        HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"),
        HUB_FAKE_LAUNCH: "1",
        HUB_WINDOWED: "1",
      },
    });
    page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    (page as any).dataDir = data;
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("shows the first game and navigates with the keyboard", async () => {
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mg12");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("menu-item-gameSelection")).toHaveClass(/focused/);
  });

  test("game selection picks a game", async () => {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("game-selection")).toBeVisible();
    await expect(page.getByTestId("tile-mgs1")).toHaveAttribute("data-focused", "true");
    // Regression coverage for the single-column selection list: ArrowDown must step one tile
    // at a time (mgs1 -> mgs2 -> mgs3), not wrap by the old 3-column stride.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("tile-mgs2")).toHaveAttribute("data-focused", "true");
    await expect(page.getByTestId("tile-mgs1")).not.toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
  });

  test("start game calls the launcher", async () => {
    // Confirming a pick on the selection screen always resets the hub menu to item 0
    // (Start Game - see navigationReducer's "selection" -> "confirm" case), so no extra
    // navigation is needed here. The brief's two ArrowUp presses would instead land on
    // Game Selection (item 0 -> 2 -> 1) and never call the launcher; dropped as a fix to
    // match reality, noted in the task-12 report.
    await page.keyboard.press("Enter");
    // `readFileSync` throws ENOENT until the main process's IPC handler finishes writing the
    // log, and `expect.poll` does not retry a callback that throws synchronously - swallowing
    // that one expected error into "" lets the poll retry on content instead, which is what
    // actually needs to wait here. Also a fix to match reality, noted in the task-12 report.
    await expect
      .poll(() => {
        try {
          return readFileSync(join((page as any).dataDir, "launch.log"), "utf8");
        } catch {
          return "";
        }
      })
      .toContain("mgs3");
  });

  test("selecting a game clears a leftover launching overlay", async () => {
    // Regression coverage: the previous test's "Start Game" left `launching` true, which used
    // to persist across every screen after it (see HubProvider's wrapped `dispatch`) - so a
    // screenshot taken right after picking a new game showed the whole screen still dimmed
    // behind "Launching...". Picking mgs1 here must land on a clean, fully opaque screen. A
    // short assertion timeout matters here: `launching`'s own 3000ms timeout would otherwise
    // clear the overlay mid-retry and mask a broken fix, since it fires well inside Playwright's
    // default 5000ms assertion poll and this test runs only tens of ms after the previous one
    // set `launching = true`.
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs1").click();
    await expect(page.locator(".overlay")).toHaveCount(0, { timeout: 200 });
  });

  test("screenshots every game at 4k", async () => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
      await page.keyboard.press("Tab");
      await page.getByTestId(`tile-${id}`).click();
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-layout", "v2");
      await expect(page.locator(".overlay")).toHaveCount(0);
      // Let the 250ms left-zone crossfade and 180ms screen fade finish so the capture shows
      // the resting-state screen, not a mid-transition frame.
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/out/${id}.png` });
    }
  });

  test("reference menus keep descriptions clear and all selection entries reachable at HD and 4K", async () => {
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      for (const id of ["mg12", "mgs2", "mgs3", "mgs4"]) {
        await page.keyboard.press("Tab");
        await page.getByTestId(`tile-${id}`).click();
        await expect(page.locator(".header-year-art").first()).toBeVisible();
        const lastDescription = await page.locator(".description").last().boundingBox();
        const menu = await page.locator(".menu").boundingBox();
        expect(lastDescription!.y + lastDescription!.height).toBeLessThan(menu!.y);
        await page.keyboard.press("Tab");
        await expect(page.getByTestId("tile-mg12").locator(".tile-number")).toHaveCount(0);
        await expect(page.getByTestId("tile-mgs2").locator(".tile-number")).toHaveText("2");
        await expect(page.getByTestId("tile-mgspw")).toBeInViewport({ ratio: 1 });
        if (id === "mgs4") {
          // The label sits on black, while its numeral sits inside the red end cap.
          const selected = page.getByTestId("tile-mgs4");
          await expect(selected.locator(".tile-title")).toHaveCSS("color", "rgb(255, 255, 255)");
          await expect(selected.locator(".tile-number")).toHaveCSS("color", "rgb(0, 0, 0)");
        }
        await page.keyboard.press("Escape");
      }
    }
  });
});
