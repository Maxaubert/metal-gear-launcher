import { test, expect, _electron as electron } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('decoded pages turn immediately and rapid jumps keep the last page until the latest destination is ready', async () => {
  const data = await mkdtemp(join(tmpdir(), 'hub-book-paging-'));
  await cp(join(__dirname, 'fixtures/assets'), join(data, 'assets'), { recursive: true });
  const app = await electron.launch({ args: [join(__dirname, '../out/main/index.js'), '--game', 'mgs2'],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, 'fixtures/steam'), HUB_WINDOWED: '1', HUB_FAKE_LAUNCH: '1' } });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      const state = { finished: [] as number[], saved: [] as number[], release: () => {} };
      Object.assign(globalThis, { pagingTest: state });
      for (const name of ['catalog', 'open', 'page', 'progress']) ipcMain.removeHandler(`hub:books:${name}`);
      ipcMain.handle('hub:books:catalog', () => ({ ok: true, value: [{ gameId: 'mgs1', gameTitle: 'Metal Gear Solid', kind: 'master', title: 'Master Book', languages: ['en'] }] }));
      ipcMain.handle('hub:books:open', (_event, r) => ({ ok: true, value: { ...r, title: 'Master Book', pageCount: 40, lastPage: 0, contents: [] } }));
      ipcMain.handle('hub:books:page', async (_event, r) => {
        if (r.page === 10) await new Promise<void>(resolve => { state.release = resolve; });
        else await new Promise(resolve => setTimeout(resolve, 100));
        state.finished.push(r.page);
        return { ok: true, value: { page: r.page, nativePage: r.page, title: `Page ${r.page + 1}`, imageUrl: 'hub-asset://mg12/mainVisual.png', artworkUrls: [], columns: [] } };
      });
      ipcMain.handle('hub:books:progress', (_event, r) => { state.saved.push(r.page); return { ok: true }; });
    });
    await page.reload();
    await expect(page.getByTestId('startup-screen')).toHaveCount(0, { timeout: 20000 });
    await page.keyboard.press('Tab'); await page.getByTestId('tile-bonus').click();
    await page.getByTestId('bonus-menu-books').click(); await page.getByTestId('book-entry-mgs1-master').click();
    const view = page.getByTestId('book-page');
    await expect(view).toHaveAttribute('aria-label', 'Book page 1');
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { pagingTest: { finished: number[] } }).pagingTest.finished.includes(6))).toBe(true);
    await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="book-page"]')!;
      Object.assign(window, { pagingFrame: frame, emptyFrames: 0 });
      new MutationObserver(() => {
        if (!document.querySelector('[data-testid="book-page"]')) (window as unknown as { emptyFrames: number }).emptyFrames++;
      }).observe(frame.parentElement!, { childList: true });
    });
    // This completes in the same render without waiting for another delayed IPC read.
    await page.getByTestId('book-next').click();
    await expect(view).toHaveAttribute('aria-label', 'Book page 2', { timeout: 100 });
    await expect(page.getByTestId('book-reader')).toHaveAttribute('aria-busy', 'false');
    const jump = async (number: number) => {
      const input = page.getByRole('spinbutton', { name: 'Page number' });
      await input.fill(String(number)); await input.press('Enter');
    };
    await jump(11);
    await expect(page.getByText('Loading page 11…', { exact: true })).toBeVisible();
    await expect(view).toHaveAttribute('aria-label', 'Book page 2');
    await expect(page.locator('.book-loading-line')).toHaveCount(0);
    await jump(21);
    await expect(view).toHaveAttribute('aria-label', 'Book page 21');
    await app.evaluate(() => (globalThis as unknown as { pagingTest: { release: () => void } }).pagingTest.release());
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { pagingTest: { finished: number[] } }).pagingTest.finished.includes(10))).toBe(true);
    await expect(view).toHaveAttribute('aria-label', 'Book page 21');
    for (let index = 0; index < 5; index++) await page.keyboard.press('PageDown');
    await expect(view).toHaveAttribute('aria-label', 'Book page 26');
    expect(await page.evaluate(() => (window as unknown as { emptyFrames: number }).emptyFrames)).toBe(0);
    expect(await view.evaluate(element => element === (window as unknown as { pagingFrame: Element }).pagingFrame)).toBe(true);
    const saved = await app.evaluate(() => (globalThis as unknown as { pagingTest: { saved: number[] } }).pagingTest.saved);
    expect(saved).not.toContain(10);
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { pagingTest: { saved: number[] } }).pagingTest.saved.at(-1))).toBe(25);
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error('Unexpected fixture directory');
    await rm(data, { recursive: true, force: true });
  }
});
