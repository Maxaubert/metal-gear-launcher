import { test, expect, _electron as electron } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { MENU_SOUNDS, type MenuSound } from "../shared/menuSounds";

function wavFixture(duration: number, amplitude = 0): Buffer {
  const samples = Math.round(8000 * duration), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    bytes.writeInt16LE(Math.round(Math.sin(index * Math.PI / 8) * amplitude * 32767), 44 + index * 2);
  }
  return bytes;
}

test("menu sounds follow semantic actions once, with no passive or ineffective-input sounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-menu-sounds-")), data = join(root, "hub");
  await cp(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
  await mkdir(join(data, "sounds"), { recursive: true });
  // Quiet handmade effects exercise the decoded-buffer leveling, not just event wiring.
  for (const [index, sound] of MENU_SOUNDS.entries()) await writeFile(join(data, "sounds", `${sound}.wav`), wavFixture((index + 5) / 100, .065 + index * .003));
  await mkdir(join(data, "music", "mgs2"), { recursive: true });
  await writeFile(join(data, "music", "mgs2", "Custom Theme.wav"), wavFixture(1));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js"), "--game", "mgs2"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"), HUB_FAKE_LAUNCH: "1", HUB_WINDOWED: "1" },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("hub:settings:get");
      ipcMain.handle("hub:settings:get", (_event, { gameId }: { gameId: string }) => ({ ok: true, value: {
        gameId, accounts: [], revision: "0".repeat(64), sections: [{ id: "native", title: "Game", kind: "native", status: "ready", fields: [
          { id: "volume", label: "Game Volume", category: "Audio", kind: "range", value: 10, min: 0, max: 10, step: 1 },
        ] }],
      } }));
      Object.assign(globalThis, { quitTimes: [] as number[] });
      ipcMain.removeHandler("hub:quit");
      ipcMain.handle("hub:quit", () => {
        (globalThis as unknown as { quitTimes: number[] }).quitTimes.push(Date.now());
        return { ok: true, value: undefined };
      });
    });
    await page.addInitScript(() => {
      const events: { duration: number; time: number; peak: number }[] = [];
      Object.assign(window, { soundEvents: events });
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        let peak = 0;
        if (this.buffer) for (let channel = 0; channel < this.buffer.numberOfChannels; channel++) {
          for (const sample of this.buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
        }
        events.push({ duration: this.buffer?.duration ?? 0, time: Date.now(), peak });
        return original.apply(this, args);
      };
    });
    await page.reload();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await page.mouse.move(0, 0);
    async function expectSounds(expected: MenuSound[]) {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const events = await page.evaluate(() => (window as unknown as { soundEvents: { duration: number; peak: number }[] }).soundEvents.splice(0));
      expect(events.map(event => Math.round(event.duration * 100))).toEqual(expected.map(sound => MENU_SOUNDS.indexOf(sound) + 5));
      for (const event of events) {
        expect(event.peak).toBeGreaterThanOrEqual(.84);
        expect(event.peak).toBeLessThanOrEqual(.851);
      }
    }
    await expectSounds([]);
    await page.keyboard.press("ArrowDown");
    await expectSounds(["navigate"]);
    await page.keyboard.press("ArrowUp");
    await expectSounds(["navigate"]);
    await page.keyboard.press("ArrowDown");
    await expectSounds(["navigate"]);
    await page.getByTestId("menu-item-gameSelection").hover();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("PageDown");
    await expectSounds([]);
    const options = page.getByTestId("menu-item-options");
    await options.hover();
    await expectSounds(["navigate"]);
    const rect = await options.boundingBox();
    await page.mouse.move(rect!.x + rect!.width / 2 + 2, rect!.y + rect!.height / 2);
    await expectSounds([]);
    await page.keyboard.press("Enter");
    await expectSounds(["options"]);
    await page.keyboard.press("Enter");
    await expectSounds(["select"]);
    await page.keyboard.press("ArrowRight");
    await expectSounds([]);
    await page.keyboard.press("ArrowLeft");
    await expectSounds(["adjust"]);
    await page.keyboard.press("Escape");
    await expectSounds(["back"]);
    await page.keyboard.press("ArrowDown");
    await expectSounds(["navigate"]);
    await page.keyboard.press("Enter");
    await expectSounds(["select"]);
    await page.keyboard.press("ArrowDown");
    await expectSounds(["navigate"]);
    await page.keyboard.press("Enter");
    await expectSounds(["adjust"]);
    await page.keyboard.press("Enter");
    await expectSounds([]);
    await page.keyboard.press("Escape");
    await expectSounds(["back"]);
    await page.keyboard.press("Escape");
    await expectSounds(["back"]);
    await page.keyboard.press("ArrowDown");
    await expectSounds(["navigate"]);
    await page.keyboard.press("Enter");
    await expectSounds(["back"]);
    await page.keyboard.press("ArrowUp");
    await expectSounds(["navigate"]);
    await page.keyboard.press("Enter");
    await expectSounds(["select"]);
    await page.keyboard.press("ArrowRight");
    await expectSounds(["navigate"]);
    await page.keyboard.press("Enter");
    await expectSounds(["select"]);
    for (const game of ["mgs4", "mgspw", "mg12", "mgs1", "mgs2", "mgs3"]) {
      await page.keyboard.press("Tab");
      await expectSounds(["select"]);
      await page.keyboard.press("ArrowRight");
      await expectSounds(["navigate"]);
      await page.keyboard.press("Enter");
      await expectSounds(["select"]);
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", game);
      await page.keyboard.press("ArrowDown");
      await expectSounds(["navigate"]);
      await page.keyboard.press("ArrowUp");
      await expectSounds(["navigate"]);
    }
    await page.keyboard.press("Enter");
    await expectSounds(["start"]);
    await page.keyboard.press("Escape");
    await expectSounds(["back"]);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { quitTimes: number[] }).quitTimes.length)).toBe(1);
    const event = await page.evaluate(() => (window as unknown as { soundEvents: { time: number; duration: number }[] }).soundEvents[0]);
    const quitAt = await app.evaluate(() => (globalThis as unknown as { quitTimes: number[] }).quitTimes[0]);
    expect(quitAt - event.time).toBeGreaterThanOrEqual(Math.round(event.duration * 1000) - 15);
    await expectSounds(["back"]);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected test directory");
    await rm(root, { recursive: true, force: true });
  }
});
