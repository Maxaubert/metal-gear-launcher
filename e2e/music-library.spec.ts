import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { musicFileId } from "../electron/main/music/library";

function silentWav(): Buffer {
  const samples = 8000 * 2;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(samples * 2, 40);
  return data;
}

async function fixture(lastGame = "mgs2") {
  const root = await mkdtemp(join(tmpdir(), "hub-custom-music-e2e-"));
  const data = join(root, "Hub data Å"), steam = join(root, "Steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  await writeFile(join(data, "config.json"), JSON.stringify({ volume: 0.35, lastGame, menuMusic: { mgs2: "mgs2-original" } }));
  const folder = join(data, "music", "mgs2");
  await mkdir(folder, { recursive: true });
  for (const name of ["Alert", "Snake's Theme", "Åpen sjø"]) await writeFile(join(folder, `${name}.wav`), silentWav());
  await writeFile(join(folder, "Album cover.png"), "not an audio file");
  return { root, data, steam, folder, options: {
    args: [join(__dirname, "..", "out", "main", "index.js")], env: {
      ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
    },
  } };
}

async function cleanup(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
  await rm(root, { recursive: true, force: true });
}

async function openMusic(page: Page) {
  await page.getByTestId("menu-item-options").click();
  await page.getByRole("button", { name: "Menu Music", exact: true }).click();
  await page.mouse.move(0, 0);
}

async function expectPlaying(page: Page, source: string) {
  await expect.poll(() => page.locator("#menu-music").evaluate((element: HTMLAudioElement, expected) =>
    !element.paused && element.currentSrc.includes(expected), source)).toBe(true);
}

test("local filenames preview on focus, save independently, survive restart and fall back when removed", async () => {
  const f = await fixture();
  let app = await electron.launch(f.options);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await expectPlaying(page, "mgs2/bgm.wav");
    const result = await page.evaluate(() => window.hub.getMenuMusic("mgs2"));
    if (!result.ok) throw new Error(result.error);
    const local = result.value.themes.filter(theme => theme.url);
    expect(local).toHaveLength(3);
    expect(local.map(theme => theme.label).sort()).toEqual(["Alert", "Snake's Theme", "Åpen sjø"].sort());
    const first = local[0]!, second = local[1]!, third = local[2]!;
    await openMusic(page);
    for (const theme of local) await expect(page.getByRole("button", { name: theme.label, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Album cover", exact: true })).toHaveCount(0);

    // Focus starts the track before confirmation, without a fade-out delay or a saved change.
    await page.getByRole("button", { name: "Original Menu Theme", exact: true }).hover();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => page.locator("#menu-music").getAttribute("src"), { timeout: 250, intervals: [10] }).toContain(first.id);
    await expectPlaying(page, first.id);
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toHaveCount(0);
    expect(JSON.parse(await readFile(join(f.data, "config.json"), "utf8")).menuMusic.mgs2).toBe("mgs2-original");
    await page.getByRole("button", { name: second.label, exact: true }).hover();
    await expect.poll(() => page.locator("#menu-music").getAttribute("src"), { timeout: 250, intervals: [10] }).toContain(second.id);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await expectPlaying(page, third.id);
    await page.keyboard.press("Escape");
    await expectPlaying(page, "mgs2/bgm.wav");
    await page.getByRole("button", { name: "Menu Music", exact: true }).click();
    await page.getByRole("button", { name: first.label, exact: true }).hover();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: second.label, exact: true }).hover();
    await page.keyboard.press("Escape");
    await expectPlaying(page, first.id);
    expect(JSON.parse(await readFile(join(f.data, "config.json"), "utf8")).menuMusic.mgs2).toBe(first.id);
    await app.close();
    app = await electron.launch(f.options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await expectPlaying(page, first.id);
    await openMusic(page);
    await page.getByRole("button", { name: second.label, exact: true }).hover();
    await expectPlaying(page, second.id);
    await page.keyboard.press("Escape");
    await expectPlaying(page, first.id);

    await app.close();
    await rm(join(f.folder, `${first.label}.wav`));
    app = await electron.launch(f.options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await expectPlaying(page, "mgs2/bgm.wav");
    await openMusic(page);
    await expect(page.getByRole("button", { name: first.label, exact: true })).toHaveCount(0);
    const saved = await page.evaluate(id => window.hub.saveMenuMusic({ gameId: "mgs2", themeId: id }), first.id);
    expect(saved.ok).toBe(false);
  } finally { await app.close(); await cleanup(f.root); }
});

test("startup remembers successful game launches instead of browsed tabs or install requests", async () => {
  const f = await fixture("mgs1");
  let app = await electron.launch(f.options);
  try {
    let page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs2").click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await app.close();
    app = await electron.launch(f.options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs2").click();
    await page.getByTestId("menu-item-start").click();
    await expect.poll(async () => JSON.parse(await readFile(join(f.data, "config.json"), "utf8")).lastLaunchedGame).toBe("mgs2");
    expect(await readFile(join(f.data, "launch.log"), "utf8")).toBe("mgs2\n");
    await app.close();
    app = await electron.launch(f.options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs3").click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    // Keep an install request inside the isolated app without opening the real Steam client.
    await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
    const missingManifest = join(f.steam, "steamapps", "appmanifest_2492670.acf");
    await rm(missingManifest);
    const rejected = await page.evaluate(() => window.hub.launch("mgs4"));
    expect(rejected.ok).toBe(false);
    const install = await page.evaluate(() => window.hub.launch("mgs4", { install: true }));
    expect(install.ok).toBe(true);
    const config = JSON.parse(await readFile(join(f.data, "config.json"), "utf8"));
    expect(config.lastLaunchedGame).toBe("mgs2");
    expect(config.lastGame).toBe("mgs1");
    await app.close();
    app = await electron.launch(f.options);
    page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
  } finally { await app.close(); await cleanup(f.root); }
});

test("a corrupt selected custom track can be bypassed and replaced from Menu Music", async () => {
  const f = await fixture();
  await writeFile(join(f.folder, "Broken.flac"), "not a valid FLAC stream");
  await writeFile(join(f.data, "config.json"), JSON.stringify({ volume: 0.35, lastGame: "mgs2",
    menuMusic: { mgs2: musicFileId("mgs2", "Broken.flac") } }));
  const app = await electron.launch(f.options);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("startup-screen")).toContainText("Could not load menu music");
    await expect(page.getByTestId("game-screen")).toHaveCount(0);
    await page.getByRole("button", { name: "Continue Without Music", exact: true }).click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    await openMusic(page);
    await page.getByRole("button", { name: "Original Menu Theme", exact: true }).click();
    await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expectPlaying(page, "mgs2/bgm.wav");
    expect(JSON.parse(await readFile(join(f.data, "config.json"), "utf8")).menuMusic.mgs2).toBe("mgs2-original");
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
  } finally { await app.close(); await cleanup(f.root); }
});
