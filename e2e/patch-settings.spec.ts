import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

function syntheticHdBinary(): Buffer {
  const bytes = Buffer.alloc(120);
  Buffer.from("VS_VERSION_INFO\0", "utf16le").copy(bytes, 20);
  bytes.writeUInt32LE(0xfeef04bd, 56);
  bytes.writeUInt32LE((4 << 16) | 1, 64);
  bytes.writeUInt32LE(1 << 16, 68);
  return bytes;
}

test("patch text remains a draft while typing and commits on Enter, blur, and Back", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-patch-text-e2e-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const scripts = join(steam, "steamapps", "common", "METAL GEAR SOLID 4", "MGS4", "scripts");
  await mkdir(scripts, { recursive: true });
  const config = join(scripts, "SunnySideUp.ini");
  await writeFile(join(scripts, "SunnySideUp.asi"), Buffer.from("SunnySideUp 1.0.6\0"));
  await writeFile(config, "[Display]\nFieldOfView=AUTO\nCutsceneFieldOfView=OFF\n");
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs4"], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 10000 });
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Community Fixes", exact: true }).click();
    await page.getByRole("button", { name: /^Sunny Side Up/ }).click();
    const fov = page.getByRole("textbox", { name: "Field of view", exact: true });
    await fov.fill("O");
    // Longer than the autosave debounce, proving incomplete text never reaches validation.
    await page.waitForTimeout(400);
    await expect(fov).toHaveValue("O");
    expect(await readFile(config, "utf8")).toContain("FieldOfView=AUTO");
    await expect(page.getByRole("button", { name: "Retry Saving", exact: true })).toHaveCount(0);
    await fov.fill("OFF");
    await fov.press("Enter");
    await expect.poll(() => readFile(config, "utf8")).toContain("FieldOfView=OFF");

    await fov.fill("90");
    await page.getByRole("heading", { name: "Sunny Side Up", exact: true }).click();
    await expect.poll(() => readFile(config, "utf8")).toContain("FieldOfView=90");

    const cutscene = page.getByRole("textbox", { name: "Cutscene field of view", exact: true });
    await cutscene.fill("1.5");
    await cutscene.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Community Fixes", exact: true })).toBeVisible();
    expect(await readFile(config, "utf8")).toContain("CutsceneFieldOfView=1.5");
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});

test("detected patch initialization is deliberate and saves only into a throwaway Steam library", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-patch-settings-e2e-"));
  const data = join(root, "hub");
  const steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  // Never inherit the fixture's original absolute Steam library path.
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  const plugins = join(steam, "steamapps", "common", "MGS2", "plugins");
  const config = join(plugins, "MGSHDFix.settings");
  await mkdir(plugins, { recursive: true });
  await writeFile(join(plugins, "MGSHDFix.asi"), syntheticHdBinary());
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } });
  try {
    const page = await app.firstWindow();
    await page.getByTestId("game-screen").waitFor();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs2").click();
    await page.getByTestId("menu-item-options").click();
    await page.getByRole("button", { name: "Community Fixes", exact: true }).click();
    await page.getByRole("button", { name: /^MGSHDFix/ }).click();
    await expect(page.getByRole("button", { name: "Set Up This Fix", exact: true })).toBeVisible();
    await expect(readFile(config)).rejects.toMatchObject({ code: "ENOENT" });

    await page.getByRole("button", { name: "Set Up This Fix", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Enable SMAA Anti-Aliasing", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    const initialized = await readFile(config, "utf8");
    expect(initialized).toContain("Enable SMAA Anti-Aliasing=0");
    expect(initialized).toContain('Fullscreen, Borderless, and Windowed="Borderless Fullscreen"');
    expect(initialized).toContain("Reset All Achievements=0");

    const backupRoot = join(data, "settings-backups", "mgs2");
    const transactions = await readdir(backupRoot);
    expect(transactions.length).toBeGreaterThanOrEqual(2);
    const manifest = JSON.parse(await readFile(join(backupRoot, transactions[0]!, "manifest.json"), "utf8")) as { path: string; backup: string | null }[];
    expect(manifest).toHaveLength(1);
    expect(manifest[0]?.backup).toBeNull();
    expect(manifest[0]?.path).toBe(config);
    expect(relative(steam, manifest[0]!.path).startsWith("..")).toBe(false);

    // A mod update may add fields that the hub does not know about.
    const extended = initialized + "\r\n; future mod setting\r\n[Future Version]\r\nCustom = keep-me\r\n";
    await writeFile(config, extended);
    await page.getByRole("button", { name: "Enable SMAA Anti-Aliasing", exact: true }).click();
    await expect(page.getByText(/Settings changed outside the hub/)).toBeVisible();
    expect(await readFile(config, "utf8")).toBe(extended);
    await page.getByRole("button", { name: "Use Current Settings", exact: true }).click();
    await page.getByRole("button", { name: "Enable SMAA Anti-Aliasing", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    const updated = await readFile(config, "utf8");
    expect(updated).toBe(extended.replace("Enable SMAA Anti-Aliasing=0", "Enable SMAA Anti-Aliasing=1"));

    const rejected = await page.evaluate(async () => {
      const snapshot = await window.hub.getGameSettings("mgs2");
      if (!snapshot.ok) throw new Error(snapshot.error);
      return window.hub.saveGameSettings({ gameId: "mgs2", revision: snapshot.value.revision,
        changes: [{ sectionId: "mgshdfix", fieldId: "Future Version/Custom", value: "malicious-edit" }] });
    });
    expect(rejected.ok).toBe(false);
    expect(await readFile(config, "utf8")).toBe(updated);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
