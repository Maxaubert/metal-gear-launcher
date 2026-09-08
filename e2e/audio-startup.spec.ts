import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

async function musicFixture() {
  const root = await mkdtemp(join(tmpdir(), "hub-audio-startup-"));
  const data = join(root, "hub"), steam = join(root, "steam");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await cp(join(__dirname, "fixtures", "steam"), steam, { recursive: true });
  await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam.replaceAll("\\", "/")}" } }`);
  await writeFile(join(data, "config.json"), JSON.stringify({ volume: 0.35, lastGame: "mgs1", menuMusic: { mgs1: "mgs1-original" } }));
  const options = { args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs1"], env: {
    ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
  } };
  return { root, data, options };
}

async function removeFixture(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
  await rm(root, { recursive: true, force: true });
}

test("initial music plays at saved volume without input and delayed playback keeps startup visible", async () => {
  const fixture = await musicFixture();
  const app = await electron.launch(fixture.options);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    const audio = page.locator("#menu-music");
    const initial = await audio.evaluate((element: HTMLAudioElement) => ({
      paused: element.paused, ready: element.readyState, volume: element.volume, loop: element.loop,
      source: element.currentSrc,
    }));
    expect(initial).toMatchObject({ paused: false, ready: 4, volume: 0.35, loop: true });
    expect(initial.source).toContain("mgs1/bgm.wav");

    // A fresh document with the real play() call held proves readiness gates presentation.
    await page.addInitScript(() => {
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        return new Promise<void>((resolve, reject) => {
          Object.assign(window, { releaseMusic: () => original.call(this).then(resolve, reject) });
        });
      };
    });
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    await expect.poll(() => page.evaluate(() => "releaseMusic" in window)).toBe(true);
    await expect(page.getByTestId("game-screen")).toHaveCount(0);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
    await page.evaluate(() => (window as unknown as { releaseMusic: () => Promise<void> }).releaseMusic());
    await expect(page.getByTestId("game-screen")).toBeVisible();
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  } finally { await app.close(); await removeFixture(fixture.root); }
});

test("broken initial music offers Retry while later track failures keep menus mounted", async () => {
  const fixture = await musicFixture();
  const song = join(fixture.data, "assets", "mgs1", "bgm.wav");
  const original = await readFile(song);
  await writeFile(song, "broken audio fixture");
  const app = await electron.launch(fixture.options);
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("startup-screen")).toContainText("Could not load menu music");
    await expect(page.getByTestId("game-screen")).toHaveCount(0);
    await writeFile(song, original);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    const audio = page.locator("#menu-music");
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
    const node = await audio.elementHandle();
    await page.getByTestId("menu-item-options").click();
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
    await page.keyboard.press("Escape");

    await writeFile(join(fixture.data, "assets", "mgs2", "bgm.wav"), "broken subsequent track");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    const screen = await page.getByTestId("game-screen").elementHandle();
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.error?.code)).toBe(4);
    await expect(page.getByTestId("startup-screen")).toHaveCount(0);
    expect(await screen!.evaluate(element => element.isConnected)).toBe(true);
    // Fast switches cancel stale playback and finish on the most recently selected game.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentSrc.includes("mgs1/bgm.wav"))).toBe(true);
    expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  } finally { await app.close(); await removeFixture(fixture.root); }
});
