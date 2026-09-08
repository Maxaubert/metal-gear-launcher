import { _electron as electron } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = join('e2e', 'out', process.env.HUB_CAPTURE_ROUND || 'pw-motion');
await mkdir(outDir, { recursive: true });
const app = await electron.launch({
  ...(process.env.HUB_EXECUTABLE_PATH ? { executablePath: process.env.HUB_EXECUTABLE_PATH } : {}),
  args: process.env.HUB_EXECUTABLE_PATH ? [] : [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HUB_WINDOWED: '1' },
  recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
});
try {
  const page = await app.firstWindow();
  console.log(await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged })));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByTestId('game-screen').waitFor();
  await page.keyboard.press('Tab');
  await page.getByTestId('tile-mgspw').click();
  await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  // Capture real elapsed playback, not a manually advanced CSS timeline.
  const started = Date.now();
  const samples = [];
  for (const seconds of [0, 1, 3, 4, 6, 7, 9, 10]) {
    const wait = started + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: join(outDir, `motion-${seconds}s.png`) });
    samples.push(await page.locator('.pw-motion').evaluate(element => ({
      elapsed: performance.now(),
      animations: element.getAnimations({ subtree: true }).map(animation => ({
        name: animation.animationName, time: animation.currentTime,
        duration: animation.effect.getTiming().duration, state: animation.playState,
      })),
    })));
  }
  await writeFile(join(outDir, 'motion-samples.json'), JSON.stringify(samples, null, 2));
  console.log('Recorded motion:', await page.video().path());
} finally {
  await app.close();
}
