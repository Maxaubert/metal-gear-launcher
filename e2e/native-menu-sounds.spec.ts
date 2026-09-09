import { test, expect, _electron as electron } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { MENU_SOUNDS } from '../shared/menuSounds';

function effect() {
  const bytes = Buffer.alloc(1644); bytes.write('RIFF'); bytes.writeUInt32LE(1636, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(1600, 40);
  for (let i = 0; i < 800; i++) bytes.writeInt16LE(Math.round(Math.sin(i / 4) * 3000), 44 + i * 2);
  return bytes.toString('base64');
}

test('fresh sound setup waits for native effects and the first navigation plays without imported files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hub-native-sounds-ui-'));
  await cp(join(__dirname, 'fixtures/assets'), join(root, 'assets'), { recursive: true });
  const app = await electron.launch({ args: [join(__dirname, '../out/main/index.js'), '--game', 'mgs2'], env: {
    ...process.env, HUB_DATA_DIR: root, HUB_STEAM_ROOT: join(__dirname, 'fixtures/steam'), HUB_WINDOWED: '1', HUB_FAKE_LAUNCH: '1',
  } });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('hub:sounds:get');
      ipcMain.handle('hub:sounds:get', () => new Promise(resolve => Object.assign(globalThis, { releaseNativeSounds: (value: unknown) => resolve({ ok: true, value }) })));
    });
    await page.addInitScript(() => {
      Object.assign(window, { soundStarts: 0 });
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        (window as unknown as { soundStarts: number }).soundStarts++;
        return start.apply(this, args);
      };
    });
    await page.reload();
    await expect.poll(() => app.evaluate(() => 'releaseNativeSounds' in globalThis)).toBe(true);
    await expect(page.getByTestId('startup-screen')).toBeVisible();
    await expect(page.getByTestId('game-screen')).toHaveCount(0);
    await app.evaluate((_electron, sounds) => (globalThis as unknown as { releaseNativeSounds: (value: unknown) => void }).releaseNativeSounds(sounds), Object.fromEntries(MENU_SOUNDS.map(sound => [sound, effect()])));
    await expect(page.getByTestId('startup-screen')).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await page.mouse.move(0, 0);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBeGreaterThan(0);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unexpected fixture directory');
    await rm(root, { recursive: true, force: true });
  }
});
