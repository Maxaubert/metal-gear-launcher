import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Exercise the production startup/cache path with a slow IPC read, rather than
// relying on the tiny fixture files to reproduce cold-disk contention.
test("startup waits for slow native settings and retries failures before revealing Options", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-settings-startup-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await page.getByTestId("startup-screen").waitFor({ state: "detached" });
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:settings:get");
      ipcMain.handle("hub:settings:get", async (_event, { gameId }: { gameId: string }) => {
        if (["mgs1", "mgs3", "mgs4"].includes(gameId)) await new Promise(resolve => setTimeout(resolve, 11500));
        return { ok: true, value: { gameId, accounts: [], revision: "a".repeat(64), sections: [{
          id: "native", title: "Native settings", kind: "native", status: "ready", fields: [
            { id: "language", label: "Language", category: "Language", kind: "choice", value: "en", options: [{ value: "en", label: "English" }] },
            { id: "volume", label: "Game Volume", category: "Audio", kind: "range", value: 8, min: 0, max: 10, step: 1 },
          ],
        }] } };
      });
    });
    await page.reload();
    await page.getByTestId("startup-screen").waitFor();
    // The old cache gave up at10s and revealed a menu without the native rows.
    await page.waitForTimeout(10500);
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveAttribute("data-error", "false");
    await page.getByTestId("startup-screen").waitFor({ state: "detached" });
    for (const id of ["mgs1", "mgs3", "mgs4"]) {
      await page.keyboard.press("Tab");
      await page.getByTestId(`tile-${id}`).click();
      await page.getByTestId("menu-item-options").click();
      await expect(page.getByRole("button", { name: "Language", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Audio", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Try Again", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:settings:get");
      let failed = false;
      ipcMain.handle("hub:settings:get", async (_event, { gameId }: { gameId: string }) => {
        if (gameId === "mgs1" && !failed) { failed = true; return { ok: false, error: "Temporary settings read failure" }; }
        return { ok: true, value: { gameId, accounts: [], revision: "b".repeat(64), sections: [{
          id: "native", title: "Native settings", kind: "native", status: "ready", fields: [
            { id: "volume", label: "Game Volume", category: "Audio", kind: "range", value: 8, min: 0, max: 10, step: 1 },
          ],
        }] } };
      });
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("Temporary settings read failure");
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByTestId("startup-screen").waitFor({ state: "detached" });
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs1").click();
    await page.getByTestId("menu-item-options").click();
    await expect(page.getByRole("button", { name: "Audio", exact: true })).toBeVisible();
    await expect(page.getByText("Temporary settings read failure")).toHaveCount(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
