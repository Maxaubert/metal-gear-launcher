import { _electron as electron } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = join('e2e', 'out', process.env.HUB_CAPTURE_ROUND || 'settings-round1');
await mkdir(directory, { recursive: true });
const app = await electron.launch({
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HUB_WINDOWED: '1' },
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByTestId('game-screen').waitFor();
  for (const id of (process.env.HUB_CAPTURE_GAMES || 'mgs1,mg12,mgs2,mgs3,mgs4,mgspw').split(',')) {
    await page.keyboard.press('Tab');
    await page.getByTestId(`tile-${id}`).click();
    await page.getByTestId('menu-item-options').click();
    await page.mouse.move(5, 5);
    await page.getByTestId('settings-screen').waitFor();
    await page.getByText('Loading settings...', { exact: true }).waitFor({ state: 'hidden' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(directory, `${id}-options.png`) });
    if (id === 'mgs2') {
      for (let cycle = 1; cycle <= 2; cycle++) {
        await page.waitForFunction(cycle => {
          const pattern = document.querySelector('[data-testid="mgs2-settings-pattern"]');
          return Number(pattern?.getAttribute('data-cycle')) >= cycle && pattern?.getAttribute('data-frame') === '6';
        }, cycle);
        await page.screenshot({ path: join(directory, `${id}-options-motion-${cycle}.png`) });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('[data-testid="mgs2-settings-pattern"]')?.getAttribute('data-motion') === 'paused');
      await page.screenshot({ path: join(directory, `${id}-options-reduced-motion.png`) });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    const result = await page.evaluate(id => window.hub.getGameSettings(id), id);
    await writeFile(join(directory, `${id}-settings.json`), JSON.stringify(result, null, 2));
    const categories = await page.locator('.settings-row-label').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') || button.textContent || ''));
    for (const label of categories.filter(label => ['Audio', 'Sound', 'Screen', 'Language', 'Community Fixes', 'Button Icons', 'Button Settings'].includes(label))) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.screenshot({ path: join(directory, `${id}-${label.toLowerCase().replaceAll(' ', '-')}.png`) });
      if (label === 'Community Fixes' && ['mgs2', 'mgs4'].includes(id)) {
        await page.locator('.settings-row-label').first().click();
        await page.screenshot({ path: join(directory, `${id}-patch-details.png`) });
        const setup = page.getByRole('button', { name: 'Set Up This Fix', exact: true });
        if (await setup.count()) {
          await setup.click();
          await page.screenshot({ path: join(directory, `${id}-patch-pending.png`) });
          await page.getByRole('button', { name: 'Discard Changes', exact: true }).click();
          await page.getByText('Loading settings...', { exact: true }).waitFor({ state: 'hidden' });
        }
        await page.keyboard.press('Escape');
      }
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');
  }
} finally { await app.close(); }
