import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

function silence() {
  const data = Buffer.alloc(44 + 8000 * 2 * 6);
  data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}

test("bonus selection owns its scene and playlist through transitions, media playback and returning", async () => {
  const data = await mkdtemp(join(tmpdir(), "hub-bonus-presentation-"));
  await cp(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
  await mkdir(join(data, "music/mgs4"), { recursive: true });
  await writeFile(join(data, "music/mgs4/Custom Theme.wav"), silence());
  await mkdir(join(data, "music/bonus"), { recursive: true });
  await writeFile(join(data, "music/bonus/01 First.wav"), silence());
  await writeFile(join(data, "music/bonus/02 Second.wav"), silence());
  await writeFile(join(data, "music/bonus/03 Broken.wav"), "invalid audio");
  await sharp({ create: { width: 780, height: 1408, channels: 3, background: "#756a35" } }).png().toFile(join(data, "assets/mg12/bonus.png"));
  await cp(join(__dirname, "fixtures/bonus/test-video.mp4"), join(data, "assets/mg12/bonus-test.mp4"));
  const app = await electron.launch({ args: [join(__dirname, "../out/main/index.js"), "--game", "mgs4"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" } });
  try {
    await app.evaluate(({ ipcMain }) => {
      const artwork = { mainVisual: "hub-asset://mg12/bonus.png" };
      ipcMain.removeHandler("hub:bonus:presentation");
      ipcMain.handle("hub:bonus:presentation", () => ({ ok: true, value: { volume: "vol1", artwork } }));
      ipcMain.removeHandler("hub:bonus:get");
      ipcMain.handle("hub:bonus:get", () => ({ ok: true, value: { artwork, volumes: [{ id: "vol1", installed: true }], warnings: [],
        tracks: [{ id: "track", title: "Native soundtrack", volume: "vol1", url: "hub-asset://mg12/bonus-test.mp4", duration: 24 }],
        videos: [{ id: "BD1_en", title: "Graphic novel", volume: "vol1", url: "hub-asset://mg12/bonus-test.mp4", duration: 24, chapters: [0, 12], language: "en" }] } }));
    });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 20000 });
    const playlist = await page.evaluate(() => window.hub.getBonusPlaylist());
    if (!playlist.ok) throw new Error(playlist.error);
    expect(playlist.value).toHaveLength(3);
    const audio = page.locator("#bonus-playlist");
    const gameAudio = page.locator("#menu-music");
    const originalSource = await gameAudio.getAttribute("src");
    await expect(audio).toHaveJSProperty("paused", true);
    await page.keyboard.press("Tab");
    await page.evaluate(() => {
      Object.assign(window, { bonusWipes: 0 });
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.getAttribute("data-testid") === "scene-backdrop" && this.getAttribute("data-game") === "bonus") {
          (window as unknown as { bonusWipes: number }).bonusWipes++;
        }
        return animate.apply(this, args);
      };
    });
    await page.getByTestId("tile-bonus").hover();
    await expect(page.getByTestId("scene-backdrop")).toHaveAttribute("data-game", "bonus");
    expect(await page.evaluate(() => (window as unknown as { bonusWipes: number }).bonusWipes)).toBeGreaterThan(0);
    await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
    await expect(page.getByTestId("scene-backdrop")).toHaveCSS("clip-path", "none");
    expect(await sharp(await page.screenshot()).extract({ left: 600, top: 500, width: 1, height: 1 }).removeAlpha().raw().toBuffer()).toEqual(Buffer.from([117, 106, 53]));
    await expect(gameAudio).toHaveJSProperty("paused", false);
    await expect(gameAudio).toHaveAttribute("src", originalSource!);
    await expect(audio).toHaveJSProperty("paused", true);
    // Keyboard browsing also previews artwork without changing the active music.
    await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowDown");
    await expect(audio).toHaveJSProperty("paused", true);
    await page.getByTestId("tile-bonus").click();
    await expect(gameAudio).toHaveJSProperty("paused", true);
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(.1);
    await audio.evaluate(el => { const media = el as HTMLAudioElement; media.currentTime = media.duration - .15; });
    await expect(audio).toHaveAttribute("src", playlist.value[1].url);
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(.1);
    await audio.evaluate(el => { const media = el as HTMLAudioElement; media.currentTime = media.duration - .15; });
    // An actual media error in track three must skip back to the first song.
    await expect(audio).toHaveAttribute("src", playlist.value[0].url);
    await expect(audio).toHaveJSProperty("paused", false);
    await page.getByTestId("bonus-menu-soundtrack").click();
    await expect(audio).toHaveJSProperty("paused", true);
    await page.keyboard.press("Escape");
    await expect(audio).toHaveJSProperty("paused", false);
    await page.getByTestId("bonus-menu-videos").click();
    await page.getByTestId("bonus-video-BD1_en").click();
    await expect(audio).toHaveJSProperty("paused", false);
    await page.keyboard.press("Enter");
    await expect(page.locator("video")).toBeVisible();
    await expect(audio).toHaveJSProperty("paused", true);
    await page.keyboard.press("Escape");
    await expect(audio).toHaveJSProperty("paused", false);
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await page.getByTestId("bonus-back").click();
    await expect(page.getByTestId("scene-backdrop")).toHaveAttribute("data-game", "bonus");
    for (const game of ["mgs1", "mgs4", "mgs3"]) {
      await page.getByTestId(`tile-${game}`).hover();
      await expect(audio).toHaveJSProperty("paused", false);
      await expect(gameAudio).toHaveJSProperty("paused", true);
      await page.getByTestId("tile-bonus").hover();
    }
    await expect(page.getByTestId("outgoing-scene")).toHaveCount(0);
    await expect(page.getByTestId("scene-backdrop")).toHaveCSS("clip-path", "none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("tile-mgs2").hover(); await page.getByTestId("tile-bonus").hover();
    expect(await page.getByTestId("scene-backdrop").evaluate(node => node.getAnimations().length)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs4");
    await expect(audio).toHaveJSProperty("paused", true);
    await expect(page.locator("#menu-music")).toHaveJSProperty("paused", false);
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-bonus").hover();
    await expect(audio).toHaveJSProperty("paused", true);
    await expect(gameAudio).toHaveJSProperty("paused", false);
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error("Unexpected fixture directory");
    await rm(data, { recursive: true, force: true });
  }
});
