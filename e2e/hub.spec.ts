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
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
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

  test("screenshots every game at 4k", async () => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
      await page.keyboard.press("Tab");
      await page.getByTestId(`tile-${id}`).click();
      await page.screenshot({ path: `e2e/out/${id}.png` });
    }
  });
});
