import { test, expect, _electron as electron } from "@playwright/test";
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pointer focus follows every game menu without activating, and keyboard takes over", async () => {
  const data = mkdtempSync(join(tmpdir(), "hub-hover-"));
  cpSync(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: {
      ...process.env,
      HUB_DATA_DIR: data,
      HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"),
      HUB_FAKE_LAUNCH: "1",
      HUB_WINDOWED: "1",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByTestId("game-screen")).toBeVisible();
    for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
      await page.keyboard.press("Tab");
      const tile = page.getByTestId(`tile-${id}`);
      await tile.hover();
      await expect(tile).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("game-selection")).toHaveAttribute("data-game", id);
      await expect(page.getByTestId("game-screen")).toHaveCount(0);
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", id);

      const options = page.getByTestId("menu-item-options");
      await options.hover();
      await expect(options).toHaveClass(/focused/);
      await expect(options).toHaveAttribute("aria-current", "true");
      await expect(page.getByTestId("settings-screen")).toHaveCount(0);

      // An unmoving cursor must not undo a keyboard selection on the next render.
      await page.keyboard.press("ArrowUp");
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.getByTestId("menu-item-gameSelection")).toHaveClass(/focused/);
      const bounds = await options.boundingBox();
      if (!bounds) throw new Error("Options row has no bounds");
      await page.mouse.move(bounds.x + bounds.width / 2 + 2, bounds.y + bounds.height / 2);
      await expect(options).toHaveClass(/focused/);
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("settings-screen")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("settings-screen")).toHaveCount(0);

      await page.getByTestId("menu-item-quit").hover();
      await expect(page.getByRole("dialog", { name: "Quit game" })).toHaveCount(0);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Quit game" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).hover();
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveAttribute("aria-current", "true");
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);

      await page.getByTestId("menu-item-start").hover();
      await expect(page.getByTestId("menu-item-start")).toHaveClass(/focused/);
      expect(existsSync(join(data, "launch.log"))).toBe(false);
    }
  } finally {
    await app.close();
  }
});

test("first-run rows respond to pointer focus without starting extraction", async () => {
  const data = mkdtempSync(join(tmpdir(), "hub-hover-first-run-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(data, "missing-steam"), HUB_WINDOWED: "1" },
  });
  try {
    const page = await app.firstWindow();
    const start = page.getByRole("button", { name: "Start", exact: true });
    const locate = page.getByRole("button", { name: "Locate Steam folder", exact: true });
    await start.hover();
    await expect(start).toHaveAttribute("aria-current", "true");
    await expect(page.getByText("Extracting...", { exact: true })).toHaveCount(0);
    await locate.hover();
    await expect(locate).toHaveAttribute("aria-current", "true");
    await expect(start).not.toHaveAttribute("aria-current", "true");
  } finally {
    await app.close();
  }
});
