import { test, expect, _electron as electron } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('books are discovered before opening, load pages on demand, navigate, recover and remember progress', async () => {
  const data = await mkdtemp(join(tmpdir(), 'hub-books-ui-'));
  await cp(join(__dirname, 'fixtures/assets'), join(data, 'assets'), { recursive: true });
  const app = await electron.launch({ args: [join(__dirname, '../out/main/index.js'), '--game', 'mgs2'],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, 'fixtures/steam'), HUB_WINDOWED: '1', HUB_FAKE_LAUNCH: '1' } });
  try {
    await app.evaluate(({ ipcMain }) => {
      const state = { catalog: 0, opened: [] as string[], pages: [] as string[], progress: {} as Record<string, number>, fail: true };
      Object.assign(globalThis, { bookTestState: state });
      const key = (r: { gameId: string; kind: string; language: string }) => `${r.gameId}-${r.kind}-${r.language}`;
      for (const name of ['catalog', 'open', 'page', 'progress']) ipcMain.removeHandler(`hub:books:${name}`);
      ipcMain.handle('hub:books:catalog', () => { state.catalog++; return { ok: true, value: [
        { gameId: 'mgs1', gameTitle: 'Metal Gear Solid', kind: 'master', title: 'Master Book', languages: ['en', 'jp'] },
        { gameId: 'mgs2', gameTitle: 'Metal Gear Solid 2', kind: 'screenplay', title: 'Screenplay Book', languages: ['en', 'jp'] },
      ] }; });
      ipcMain.handle('hub:books:open', (_event, r) => {
        state.opened.push(key(r));
        return { ok: true, value: { ...r, title: r.kind === 'master' ? 'Master Book' : 'Screenplay Book', pageCount: 4,
          lastPage: state.progress[key(r)] ?? 0, contents: [{ title: 'Cover', page: 0 }, { title: 'Mission Briefing', page: 3 }] } };
      });
      ipcMain.handle('hub:books:page', async (_event, r) => {
        state.pages.push(`${key(r)}:${r.page}`);
        if (r.page === 2 && state.fail) { state.fail = false; return { ok: false, error: 'Page could not be read. Retry to try again.' }; }
        return { ok: true, value: { page: r.page, nativePage: r.page, title: r.page ? 'Mission Briefing' : 'Cover',
          imageUrl: r.kind === 'master' || !r.page ? 'hub-asset://mg12/mainVisual.png' : undefined, artworkUrls: [],
          columns: r.kind === 'screenplay' && r.page ? [
            { id: 'TextAreaA0', markup: '<b>Snake enters the room.</b><br><width=613>The corridor is quiet.</width>' },
            { id: 'TextAreaB0', markup: '<b>Campbell</b><br>Snake, can you hear me?<script>window.bookAttack=true</script>' },
          ] : [] } };
      });
      ipcMain.handle('hub:books:progress', (_event, r) => { state.progress[key(r)] = r.page; return { ok: true, value: undefined }; });
    });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await expect(page.getByTestId('startup-screen')).toHaveCount(0, { timeout: 20000 });
    const state = () => app.evaluate(() => (globalThis as unknown as { bookTestState: { catalog: number; opened: string[]; pages: string[]; progress: Record<string, number> } }).bookTestState);
    expect((await state()).catalog).toBeGreaterThan(0);
    expect((await state()).opened).toEqual([]);
    expect((await state()).pages).toEqual([]);
    await page.keyboard.press('Tab'); await page.getByTestId('tile-bonus').click();
    await page.getByTestId('bonus-menu-books').click();
    await expect(page.getByTestId('books-screen')).toBeVisible();
    expect(await page.locator('.books-library-body').evaluate(body => [...body.children].every(child => child.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1))).toBe(true);
    expect((await state()).opened).toEqual([]);
    await page.getByTestId('book-entry-mgs1-master').click();
    await expect(page.getByTestId('book-page').locator('img').first()).toBeVisible();
    await expect.poll(async () => (await state()).progress['mgs1-master-en']).toBe(0);
    const bookBounds = await page.getByTestId('book-page').boundingBox();
    expect(bookBounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    await page.mouse.move(960, 540);
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'false', { timeout: 5000 });
    expect(await page.getByTestId('book-page').boundingBox()).toEqual(bookBounds);
    await page.keyboard.press('Shift');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'true');
    await page.getByTestId('book-next').hover();
    await page.waitForTimeout(2800);
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'true');
    await page.getByRole('spinbutton', { name: 'Page number' }).focus();
    await page.mouse.move(960, 540);
    await page.waitForTimeout(2800);
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'true');
    await page.getByRole('spinbutton', { name: 'Page number' }).blur();
    expect(await page.getByTestId('book-page').boundingBox()).toEqual(bookBounds);
    const toolbarBounds = await page.getByTestId('book-controls').boundingBox();
    expect(toolbarBounds!.width).toBeLessThan(1200);
    expect(toolbarBounds!.height).toBeLessThanOrEqual(72);
    await page.getByTestId('book-hide-controls').click();
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-hidden', 'true');
    await expect(page.getByTestId('book-controls')).toHaveAttribute('inert', '');
    await expect(page.getByTestId('book-reader').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('book-show-controls')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/out/books-hidden-controls.png' });
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-book-overlay]')))).toBe(false);
    await page.mouse.move(100, 100); await page.mouse.move(1200, 650);
    await page.keyboard.press('PageDown');
    await expect(page.getByTestId('book-page')).toHaveAttribute('aria-label', 'Book page 2');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'false');
    await page.keyboard.press('PageUp');
    await expect(page.getByTestId('book-page')).toHaveAttribute('aria-label', 'Book page 1');
    await page.keyboard.press('KeyC');
    await expect(page.locator('.book-contents-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'false');
    await page.keyboard.press('KeyH');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-hidden', 'false');
    await page.getByRole('spinbutton', { name: 'Page number' }).focus();
    await page.keyboard.press('KeyH');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-hidden', 'false');
    await page.getByRole('spinbutton', { name: 'Page number' }).blur();
    await page.getByTestId('book-next').focus();
    await page.keyboard.press('KeyH');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'false');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-book-overlay]')))).toBe(false);
    await page.keyboard.press('KeyH');
    await expect(page.getByTestId('book-reader')).toHaveAttribute('data-controls-visible', 'true');
    expect(await page.getByTestId('book-page').boundingBox()).toEqual(bookBounds);
    await page.getByTestId('book-next').click();
    await expect.poll(async () => (await state()).progress['mgs1-master-en']).toBe(1);
    await page.getByTestId('book-zoom-in').click();
    await page.getByTestId('book-fit').click();
    await page.getByTestId('book-next').click();
    await expect(page.getByTestId('book-retry')).toBeVisible();
    expect((await state()).progress['mgs1-master-en']).toBe(1);
    await page.getByTestId('book-retry').click();
    await expect.poll(async () => (await state()).progress['mgs1-master-en']).toBe(2);
    await page.getByTestId('book-back').click();
    await page.getByTestId('book-entry-mgs1-master').click();
    await expect(page.getByTestId('book-page')).toHaveAttribute('aria-label', 'Book page 3');
    await page.getByTestId('book-contents').click();
    await page.getByRole('button', { name: 'Mission Briefing', exact: false }).click();
    await expect.poll(async () => (await state()).progress['mgs1-master-en']).toBe(3);
    await page.getByTestId('book-back').click();
    await page.getByRole('button', { name: '日本語', exact: true }).click();
    await page.getByTestId('book-entry-mgs1-master').click();
    await expect(page.getByTestId('book-page')).toHaveAttribute('aria-label', 'Book page 1');
    await page.getByTestId('book-back').click();
    await page.getByTestId('book-entry-mgs2-screenplay').click();
    await page.getByTestId('book-next').click();
    await expect(page.getByTestId('book-page')).toContainText('Snake enters the room.');
    await expect(page.getByTestId('book-page')).toContainText('Snake, can you hear me?');
    expect(await page.evaluate(() => (window as unknown as { bookAttack?: boolean }).bookAttack)).toBeUndefined();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(() => page.getByTestId('book-page').evaluate(view => view.scrollWidth - view.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'e2e/out/books-screenplay-720.png' });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await expect(page.getByTestId('bonus-content')).toBeVisible();
    await page.getByTestId('bonus-back').click();
    await page.getByTestId('tile-mgs2').click();
    await expect(page.getByTestId('game-screen')).toBeVisible();
  } finally {
    await app.close();
    if (dirname(resolve(data)) !== resolve(tmpdir())) throw new Error('Unexpected fixture directory');
    await rm(data, { recursive: true, force: true });
  }
});
