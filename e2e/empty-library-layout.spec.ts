import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

type Calls = { launches: { gameId: string; install?: boolean }[]; folders: number; quits: number };

async function fixture(partial: boolean) {
  const root = await mkdtemp(join(tmpdir(), "hub-empty-layout-"));
  const data = join(root, "Launcher data"), steam = join(root, "Steam Å");
  let app: ElectronApplication | undefined;
  const close = async () => {
    await app?.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected fixture directory");
    await rm(root, { recursive: true, force: true });
  };
  try {
    await mkdir(join(steam, "steamapps"), { recursive: true });
    await writeFile(join(steam, "steam.exe"), "synthetic fixture");
    if (partial) {
      await cp(join(__dirname, "fixtures/steam/steamapps/common/MGS3"), join(steam, "steamapps/common/MGS3"), { recursive: true });
      await cp(join(__dirname, "fixtures/assets/mgs3"), join(data, "assets/mgs3"), { recursive: true });
      await writeFile(join(steam, "steamapps/appmanifest_2131650.acf"), '"AppState" { "installdir" "MGS3" "buildid" "100004" }');
    }
    // Explicitly request the absent MG/MG2 page in both cases. The empty case
    // deliberately has no artwork or font cache at all.
    app = await electron.launch({ args: [join(__dirname, "../out/main/index.js"), "--game", "mg12"], env: {
      ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: steam, HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1",
    } });
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      const calls: Calls = { launches: [], folders: 0, quits: 0 };
      Object.assign(globalThis, { emptyLayoutCalls: calls });
      ipcMain.removeHandler("hub:launch");
      ipcMain.handle("hub:launch", (_event, request) => { calls.launches.push(request); return { ok: true, value: undefined }; });
      ipcMain.removeHandler("hub:pickFolder");
      ipcMain.handle("hub:pickFolder", () => { calls.folders++; return { ok: false, error: "Cancelled fixture picker" }; });
      ipcMain.removeHandler("hub:quit");
      ipcMain.handle("hub:quit", () => { calls.quits++; return { ok: true, value: undefined }; });
    });
    await expect(page.getByTestId("not-installed-screen")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 20000 });
    return { app, page, close };
  } catch (error) { await close(); throw error; }
}

async function calls(app: ElectronApplication): Promise<Calls> {
  return app.evaluate(() => (globalThis as unknown as { emptyLayoutCalls: Calls }).emptyLayoutCalls);
}

async function pressPad(page: Page, button: number) {
  await page.evaluate(async index => {
    const original = navigator.getGamepads.bind(navigator);
    const pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === index })) };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
    const frames = () => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    await frames();
    pad.buttons.forEach(value => { value.pressed = false; });
    await frames();
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: original });
  }, button);
}

async function captureLayouts(app: ElectronApplication, page: Page, name: string) {
  const output = join(__dirname, "out/empty-library-layout");
  await mkdir(output, { recursive: true });
  for (const [width, height, zoom] of [[1280, 720, 1], [1920, 1080, 1], [960, 540, 1], [960, 540, 1.5]] as const) {
    await page.setViewportSize({ width, height });
    await app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(factor), zoom);
    const screen = page.getByTestId("not-installed-screen");
    await screen.evaluate(element => { element.scrollTop = 0; });
    const geometry = await screen.evaluate(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      const blocks = Array.from(element.querySelectorAll("h1, button")).map(item => {
        const box = item.getBoundingClientRect();
        return { tag: item.tagName, label: item.textContent, top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
      });
      const cornersCovered = [[1, 1], [innerWidth - 2, 1], [1, innerHeight - 2], [innerWidth - 2, innerHeight - 2]]
        .every(([x, y]) => { const top = document.elementFromPoint(x!, y!); return top === element || element.contains(top); });
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        color: style.backgroundColor, opacity: style.opacity, overflowX: element.scrollWidth > element.clientWidth, cornersCovered, blocks };
    });
    expect(geometry.left).toBeCloseTo(0, 0);
    expect(geometry.top).toBeCloseTo(0, 0);
    expect(geometry.width).toBeCloseTo(geometry.viewportWidth, 0);
    expect(geometry.height).toBeCloseTo(geometry.viewportHeight, 0);
    expect(geometry.opacity).toBe("1");
    expect(geometry.color).not.toBe("transparent");
    expect(geometry.color).toMatch(/^rgb\(/);
    expect(geometry.overflowX).toBe(false);
    expect(geometry.cornersCovered).toBe(true);
    expect(geometry.blocks.filter(block => block.tag === "BUTTON")).toHaveLength(3);
    for (const block of geometry.blocks) {
      expect(block.left, block.label ?? "").toBeGreaterThanOrEqual(0);
      expect(block.right, block.label ?? "").toBeLessThanOrEqual(geometry.viewportWidth + 1);
      expect(block.top, block.label ?? "").toBeGreaterThanOrEqual(0);
      if (width > 960) expect(block.bottom, block.label ?? "").toBeLessThanOrEqual(geometry.viewportHeight + 1);
      if (block.tag === "BUTTON") expect(block.height).toBeGreaterThanOrEqual(44);
    }
    for (let i = 1; i < geometry.blocks.length; i++) expect(geometry.blocks[i]!.top).toBeGreaterThanOrEqual(geometry.blocks[i - 1]!.bottom);
    await page.screenshot({ path: join(output, `${name}-${width}x${height}-zoom-${zoom}.png`) });
    if (width <= 960) {
      for (const button of await screen.getByRole("button").all()) {
        await button.scrollIntoViewIfNeeded();
        // Fractional device pixels at browser zoom can clip a fraction of a border.
        await expect(button).toBeInViewport({ ratio: .99 });
      }
      await page.screenshot({ path: join(output, `${name}-${width}x${height}-zoom-${zoom}-actions.png`) });
    }
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1));
  await page.setViewportSize({ width: 1920, height: 1080 });
}

test("a cache-free empty library has an opaque, readable landing page with working menu actions", async () => {
  const { app, page, close } = await fixture(false);
  try {
    const screen = page.getByTestId("not-installed-screen"), selection = page.getByTestId("game-selection");
    await expect(screen.getByRole("heading", { name: "No games installed", exact: true })).toBeVisible();
    await expect(screen.getByRole("button")).toHaveText(["Game Selection", "Choose Steam folder", "Quit Launcher"]);
    await expect(screen.getByRole("button", { name: "Install on Steam" })).toHaveCount(0);
    await captureLayouts(app, page, "empty");
    await page.mouse.move(0, 0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await calls(app)).folders).toBe(1);
    await expect(screen).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(selection).toBeVisible();
    await expect(selection.locator(".tile.not-installed")).toHaveCount(6);
    await page.keyboard.press("Escape");
    await expect(screen).toBeVisible();
    for (const key of ["Escape", "Tab"]) {
      await page.keyboard.press(key);
      await expect(selection).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(screen).toBeVisible();
    }
    await pressPad(page, 1);
    await expect(selection).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(screen).toBeVisible();
    expect(await calls(app)).toEqual({ launches: [], folders: 1, quits: 0 });
    // DOM focus can remain on row zero while hover selects row two. Wrapping Down
    // must update the selected row even when focus() targets the already-focused node.
    await screen.getByRole("button", { name: "Game Selection", exact: true }).focus();
    await screen.getByRole("button", { name: "Quit Launcher", exact: true }).hover();
    await page.keyboard.press("ArrowDown");
    await expect(screen.getByRole("button", { name: "Game Selection", exact: true })).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Enter");
    await expect(selection).toBeVisible();
    expect((await calls(app)).quits).toBe(0);
    await page.keyboard.press("Escape");
    await expect(screen).toBeVisible();
    await page.mouse.move(0, 0);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await calls(app)).quits).toBe(1);
    expect((await calls(app)).launches).toEqual([]);
  } finally { await close(); }
});

test("a missing default game in a partial library shows its own actions and only explicit install invokes Steam", async () => {
  const { app, page, close } = await fixture(true);
  try {
    const screen = page.getByTestId("not-installed-screen"), selection = page.getByTestId("game-selection");
    const state = await page.evaluate(() => window.hub.getState());
    if (!state.ok) throw new Error(state.error);
    const missing = state.value.games.find(game => game.pack.id === "mg12")!;
    expect(missing.installed).toBe(false);
    await expect(screen.getByRole("heading", { name: missing.pack.shortTitle, exact: true })).toBeVisible();
    await expect(screen.getByText(missing.pack.title, { exact: true })).toBeVisible();
    await expect(screen.getByText("Not installed", { exact: true })).toBeVisible();
    await expect(screen.getByRole("button")).toHaveText(["Game Selection", "Install on Steam", "Quit Launcher"]);
    await captureLayouts(app, page, "partial");
    await page.mouse.move(0, 0);
    await page.keyboard.press("Enter");
    await expect(selection).toBeVisible();
    await expect(page.getByTestId("tile-mgs3")).not.toHaveAttribute("aria-disabled", "true");
    await expect(selection.locator(".tile.not-installed")).toHaveCount(5);
    await page.keyboard.press("Escape");
    await expect(screen).toBeVisible();
    expect(await calls(app)).toEqual({ launches: [], folders: 0, quits: 0 });
    await pressPad(page, 13);
    await pressPad(page, 0);
    await expect.poll(async () => (await calls(app)).launches).toEqual([{ gameId: "mg12", install: true }]);
    await expect(screen).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(selection).toBeVisible();
    await page.getByTestId("tile-mgs3").click();
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    await expect(screen).toHaveCount(0);
    expect(await calls(app)).toEqual({ launches: [{ gameId: "mg12", install: true }], folders: 0, quits: 0 });
  } finally { await close(); }
});
