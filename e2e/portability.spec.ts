import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("a partial Unicode library needs no community fixes and uses its separate data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-portable-e2e-"));
  const data = join(root, "Hub data Å 日本語");
  const steam = join(root, "Steam 東京");
  const library = join(root, "Spill og prøver");
  const game = join(library, "steamapps", "common", "MGS3 Å 日本語");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await mkdir(join(steam, "steamapps"), { recursive: true });
    await cp(join(__dirname, "fixtures", "steam", "steamapps", "common", "MGS3"), game, { recursive: true });
    await cp(join(__dirname, "fixtures", "assets", "mgs3"), join(data, "assets", "mgs3"), { recursive: true });
    await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "1" { "path" "${library.replaceAll("\\", "/")}" } }`);
    await writeFile(join(library, "steamapps", "appmanifest_2131650.acf"), '"AppState" { "installdir" "MGS3 Å 日本語" "buildid" "100004" }');
    const launcher = join(game, "mgs3_savedata_win", "76561198000000001", "launcher");
    await mkdir(launcher, { recursive: true });
    await writeFile(join(launcher, "launcher_sv"), '{"keyList":["languageLauncher"],"valueList":["1"]}');
    app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
      ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
    } });
    const page = await app.firstWindow();
    await expect(page.getByText("Not installed", { exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(".tile.not-installed")).toHaveCount(5);
    await page.getByTestId("tile-mgs3").click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    const settings = await page.evaluate(() => window.hub.getGameSettings("mgs3"));
    expect(settings.ok).toBe(true);
    if (!settings.ok) throw new Error(settings.error);
    expect(settings.value.sections.filter(section => section.kind === "patch")).toEqual([]);
    expect(settings.value.sections.find(section => section.id === "native-launcher")?.fields.some(field => field.id === "languageLauncher")).toBe(true);
    await page.getByTestId("menu-item-start").click();
    await expect.poll(async () => { try { return await readFile(join(data, "launch.log"), "utf8"); } catch { return ""; } }).toContain("mgs3");
  } finally {
    await app?.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("a fresh empty Steam install opens without artwork or font caches", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-empty-e2e-"));
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    const steam = join(root, "Steam Å 東京");
    await mkdir(steam);
    await writeFile(join(steam, "steam.exe"), "synthetic fixture");
    app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
      ...process.env, HUB_DATA_DIR: join(root, "Fresh data 日本語"), HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
    } });
    const page = await app.firstWindow();
    await expect(page.getByText("Not installed", { exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(".tile.not-installed")).toHaveCount(6);
    await expect(page.locator(".tile-cover")).toHaveCount(0);
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
  } finally {
    await app?.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("missing Steam can be located manually and a first installed game requests extraction", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-discovery-e2e-"));
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    const steam = join(root, "Steam not yet located Å");
    app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
      ...process.env, HUB_DATA_DIR: join(root, "New data 東京"), HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
    } });
    const page = await app.firstWindow();
    await expect(page.getByText("Locate Steam folder", { exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await cp(join(__dirname, "fixtures", "steam", "steamapps", "common", "MGS3"), join(steam, "steamapps", "common", "MGS3"), { recursive: true });
    await writeFile(join(steam, "steam.exe"), "synthetic fixture");
    await writeFile(join(steam, "steamapps", "appmanifest_2131650.acf"), '"AppState" { "installdir" "MGS3" "buildid" "100004" }');
    const result = await page.evaluate(path => window.hub.setSteamPath(path), steam);
    expect(result.ok).toBe(true);
    // Reload to follow the same state path as the folder-picker's successful callback.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Preparing your games", exact: true })).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await expect(page.getByText("Locate Steam folder", { exact: true })).toHaveCount(0);
    await expect(page.getByText("MGS3", { exact: true })).toBeVisible();
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
  } finally {
    await app?.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});
