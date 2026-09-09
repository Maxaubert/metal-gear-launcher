import { test, expect, _electron as electron } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { PreparationProgress, PreparationResult } from '../shared/preparation';

test('initial preparation blocks menus, reports real work, retries failures and completes before reveal', async () => {
  const data = await mkdtemp(join(tmpdir(), 'hub-preparation-ui-'));
  await cp(join(__dirname, 'fixtures/assets'), join(data, 'assets'), { recursive: true });
  const app = await electron.launch({ args: [join(__dirname, '../out/main/index.js'), '--game', 'mgs2'],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, 'fixtures/steam'), HUB_WINDOWED: '1', HUB_FAKE_LAUNCH: '1' } });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      const state = { calls: 0, warm: false, resolve: undefined as ((result: unknown) => void) | undefined };
      Object.assign(globalThis, { preparationTest: state });
      ipcMain.removeHandler('hub:preparation:run');
      ipcMain.handle('hub:preparation:run', () => {
        state.calls++;
        const progress = state.warm
          ? { phase: 'ready', completed: 100, total: 100, label: 'Library ready', failures: [] }
          : { phase: 'planning', completed: 2, total: 24, label: 'Indexing installed books', failures: [] };
        BrowserWindow.getAllWindows()[0]!.webContents.send('hub:preparation:progress', progress);
        if (state.warm) return { ok: true, value: { ready: true, warm: true, completed: 100, total: 100, failures: [] } };
        return new Promise(resolve => { state.resolve = resolve; });
      });
    });
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.reload();
    const emit = (progress: PreparationProgress) => app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]!.webContents.send('hub:preparation:progress', value), progress);
    const finish = (result: PreparationResult) => app.evaluate((_electron, value) => (globalThis as unknown as { preparationTest: { resolve: (result: unknown) => void } }).preparationTest.resolve({ ok: true, value }), result);
    await expect(page.getByTestId('library-preparation')).toContainText('Indexing installed books');
    await emit({ phase: 'preparing', completed: 50, total: 100, label: 'Metal Gear Solid · Screenplay Book · English', failures: [] });
    const bar = page.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '50');
    for (const key of ['Escape', 'Tab', 'Enter', 'ArrowDown']) await page.keyboard.press(key);
    await expect(page.getByTestId('startup-screen')).toBeVisible();
    await expect(page.getByTestId('hub-content')).toHaveAttribute('inert', '');
    await expect(page.getByTestId('game-selection')).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.locator('.startup-content')).toHaveCSS('opacity', '1');
    await expect(page.locator('.startup-loading-rail span')).toHaveCSS('transform', 'matrix(0.5, 0, 0, 1, 0, 0)');
    await page.screenshot({ path: 'e2e/out/preparation-1080.png' });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: 'e2e/out/preparation-720.png' });
    const failures = [{ id: 'page', label: 'Screenplay Book', error: 'The source file could not be read.' }];
    await emit({ phase: 'failed', completed: 50, total: 100, label: 'Preparation needs attention', failures });
    await finish({ ready: false, warm: false, completed: 50, total: 100, failures });
    await expect(page.getByRole('button', { name: 'Retry preparation', exact: true })).toBeVisible();
    await expect(page.getByTestId('library-preparation')).toContainText('The source file could not be read.');
    await expect(page.getByRole('button')).toHaveCount(1);
    // Terminal IPC progress can arrive after the invocation response; it must retain recovery.
    await emit({ phase: 'failed', completed: 50, total: 100, label: 'Preparation needs attention', failures });
    await expect(page.getByRole('button', { name: 'Retry preparation', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry preparation', exact: true }).click();
    await expect(page.getByTestId('library-preparation')).toContainText('Indexing installed books');
    await emit({ phase: 'preparing', completed: 75, total: 100, label: 'Preparing remaining book pages', failures: [] });
    await expect(bar).toHaveAttribute('aria-valuenow', '75');
    await emit({ phase: 'verifying', completed: 100, total: 100, label: 'Verifying prepared content', failures: [] });
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    await expect(page.getByTestId('startup-screen')).toBeVisible();
    await emit({ phase: 'ready', completed: 100, total: 100, label: 'Library ready', failures: [] });
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await finish({ ready: true, warm: false, completed: 100, total: 100, failures: [] });
    await expect(page.getByTestId('startup-screen')).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await emit({ phase: 'ready', completed: 100, total: 100, label: 'Library ready', failures: [] });
    await expect(page.getByTestId('startup-screen')).toHaveCount(0);
    await page.getByTestId('menu-item-options').click();
    await expect(page.getByRole('button', { name: 'Menu Music', exact: true })).toBeVisible();
    await app.evaluate(() => { (globalThis as unknown as { preparationTest: { warm: boolean } }).preparationTest.warm = true; });
    await page.reload();
    await expect(page.getByTestId('startup-screen')).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByTestId('game-screen')).toBeVisible();
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error('Unexpected fixture directory');
    await rm(data, { recursive: true, force: true });
  }
});
