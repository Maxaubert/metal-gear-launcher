/* eslint-disable @typescript-eslint/no-explicit-any -- `page` is stashed with a custom `dataDir`
   property for the launch-log assertion below; casting through `any` is the brief's own approach
   (mirrors tests/launch/launcher.test.ts's fake-child casts) rather than extending Playwright's Page type. */
import { test, expect, _electron as electron } from "@playwright/test";
import { join } from "node:path";
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import sharp from "sharp";

test.describe("hub", () => {
  let app: Awaited<ReturnType<typeof electron.launch>>;
  let page: Awaited<ReturnType<typeof app.firstWindow>>;

  test.beforeAll(async () => {
    const data = mkdtempSync(join(tmpdir(), "hub-e2e-"));
    cpSync(join(__dirname, "fixtures", "assets"), join(data, "assets"), { recursive: true });
    // Hand-made marks at the reference dimensions, without proprietary image data.
    for (const id of ["mgs2", "mgs3"]) {
      const dir = join(data, "assets", id);
      await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="309" height="122"><path d="M234 0V92 M298 0V92 M306 0V92 M0 121L20 102H309" fill="none" stroke="black"/></svg>'))
        .png().toFile(join(dir, "headerMark.png"));
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      manifest.files.headerMark = "headerMark.png";
      writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    }
    app = await electron.launch({
      args: [join(__dirname, "..", "out", "main", "index.js")],
      env: {
        ...process.env,
        HUB_DATA_DIR: data,
        HUB_STEAM_ROOT: join(__dirname, "fixtures", "steam"),
        HUB_FAKE_LAUNCH: "1",
        HUB_WINDOWED: "1",
      },
    });
    page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    (page as any).dataDir = data;
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("shows the first game and navigates with the keyboard", async () => {
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mg12");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs1");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("menu-item-gameSelection")).toHaveClass(/focused/);
  });

  test("game selection picks a game", async () => {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("game-selection")).toBeVisible();
    await expect(page.getByTestId("tile-mgs1")).toHaveAttribute("data-focused", "true");
    // Regression coverage for the single-column selection list: ArrowDown must step one tile
    // at a time (mgs1 -> mgs2 -> mgs3), not wrap by the old 3-column stride.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("tile-mgs2")).toHaveAttribute("data-focused", "true");
    await expect(page.getByTestId("tile-mgs1")).not.toHaveAttribute("data-focused", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
  });

  test("start game calls the launcher", async () => {
    // Confirming a pick on the selection screen always resets the hub menu to item 0
    // (Start Game - see navigationReducer's "selection" -> "confirm" case), so no extra
    // navigation is needed here. The brief's two ArrowUp presses would instead land on
    // Game Selection (item 0 -> 2 -> 1) and never call the launcher; dropped as a fix to
    // match reality, noted in the task-12 report.
    await page.keyboard.press("Enter");
    // `readFileSync` throws ENOENT until the main process's IPC handler finishes writing the
    // log, and `expect.poll` does not retry a callback that throws synchronously - swallowing
    // that one expected error into "" lets the poll retry on content instead, which is what
    // actually needs to wait here. Also a fix to match reality, noted in the task-12 report.
    await expect
      .poll(() => {
        try {
          return readFileSync(join((page as any).dataDir, "launch.log"), "utf8");
        } catch {
          return "";
        }
      })
      .toContain("mgs3");
  });

  test("selecting a game clears a leftover launching overlay", async () => {
    // Regression coverage: the previous test's "Start Game" left `launching` true, which used
    // to persist across every screen after it (see HubProvider's wrapped `dispatch`) - so a
    // screenshot taken right after picking a new game showed the whole screen still dimmed
    // behind "Launching...". Picking mgs1 here must land on a clean, fully opaque screen. A
    // short assertion timeout matters here: `launching`'s own 3000ms timeout would otherwise
    // clear the overlay mid-retry and mask a broken fix, since it fires well inside Playwright's
    // default 5000ms assertion poll and this test runs only tens of ms after the previous one
    // set `launching = true`.
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs1").click();
    await expect(page.locator(".overlay")).toHaveCount(0, { timeout: 200 });
  });

  test("screenshots every game at 4k", async () => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
      await page.keyboard.press("Tab");
      await page.getByTestId(`tile-${id}`).click();
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-layout", "v2");
      await expect(page.locator(".overlay")).toHaveCount(0);
      // Let the 250ms left-zone crossfade and 180ms screen fade finish so the capture shows
      // the resting-state screen, not a mid-transition frame.
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/out/${id}.png` });
    }
  });

  test("reference menus keep descriptions clear and all selection entries reachable at HD and 4K", async () => {
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
        await page.keyboard.press("Tab");
        await page.getByTestId(`tile-${id}`).click();
        await expect(page.locator(".header-year-art").first()).toBeVisible();
        const lastDescription = await page.locator(".description").last().boundingBox();
        const menu = await page.locator(".menu").boundingBox();
        expect(lastDescription!.y + lastDescription!.height).toBeLessThan(menu!.y);
        // Native references share 700x60 rows at a 70px pitch, normalized to 1080p.
        const button = await page.getByTestId("menu-item-options").boundingBox();
        const previous = await page.getByTestId("menu-item-gameSelection").boundingBox();
        const scale = width / 1920;
        expect(button!.x / scale).toBeCloseTo(1208, 0);
        expect(button!.width / scale).toBeCloseTo(700, 0);
        expect(button!.height / scale).toBeCloseTo(60, 0);
        expect((button!.y - previous!.y) / scale).toBeCloseTo(70, 0);
        await expect(page.getByTestId("menu-item-options")).toHaveCSS("font-size", `${32 * scale}px`);
        await expect(page.getByTestId("menu-item-start")).toHaveCSS("box-shadow", "none");
        await page.keyboard.press("Tab");
        await expect(page.getByTestId("tile-mg12").locator(".tile-number")).toHaveCount(0);
        await expect(page.getByTestId("tile-mgs2").locator(".tile-number")).toHaveText("2");
        await expect(page.getByTestId("tile-mgspw")).toBeInViewport({ ratio: 1 });
        if (id === "mgs4" || id === "mgspw") {
          // The bracket replaces the filled end cap, so both labels need contrast on black.
          const selected = page.getByTestId(`tile-${id}`);
          await expect(selected.locator(".tile-title")).toHaveCSS("color", "rgb(255, 255, 255)");
          await expect(selected.locator(".tile-number")).not.toHaveCSS("color", "rgb(0, 0, 0)");
        }
        await page.keyboard.press("Escape");
      }
    }
  });

  test("main menu keeps its game and focused row until Game Selection confirms a different game", async () => {
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs3").click();
    await page.mouse.move(0, 0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    for (const key of ["ArrowLeft", "ArrowRight", "PageUp", "PageDown"]) {
      await page.keyboard.press(key);
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
      await expect(page.getByTestId("menu-item-options")).toHaveClass(/focused/);
    }
    for (const shoulder of [4, 5]) {
      await page.evaluate(async index => {
        const original = navigator.getGamepads.bind(navigator);
        Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [{
          buttons: Array.from({ length: 16 }, (_, button) => ({ pressed: button === index })), axes: [0, 0],
        }] });
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        Object.defineProperty(navigator, "getGamepads", { configurable: true, value: original });
      }, shoulder);
      await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
      await expect(page.getByTestId("menu-item-options")).toHaveClass(/focused/);
    }
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("tile-mgs4")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs3");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("tile-mgs2")).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
  });

  test("game selection keeps single-game menus and year headers anchored", async () => {
    for (const width of [1920, 3840]) {
      const scale = width / 1920;
      await page.setViewportSize({ width, height: width * 9 / 16 });
      await page.keyboard.press("Tab");
      await page.getByTestId("tile-mgs1").click();
      for (const direction of ["ArrowRight", "ArrowLeft"]) {
        for (let i = 0; i < 6; i++) {
          const id = await page.getByTestId("game-screen").getAttribute("data-game");
          const menu = await page.locator(".menu").boundingBox();
          const header = await page.locator(".persistent-backdrop .head").first().boundingBox();
          expect(menu!.y / scale).toBeCloseTo(id === "mg12" ? 594 : 524.88, 1);
          if (id !== "mg12") {
            expect(header!.x / scale).toBeCloseTo(1219.2, 1);
            expect(header!.y / scale).toBeCloseTo(86.4, 1);
          }
          await page.keyboard.press("Tab");
          await page.keyboard.press(direction);
          await page.keyboard.press("Enter");
        }
      }
    }
  });

  test("MGS1 shares MGS2 and MGS3 right-panel type and rule styling", async () => {
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      const panels = [];
      for (const id of ["mgs1", "mgs2", "mgs3"]) {
        await page.keyboard.press("Tab");
        await page.getByTestId(`tile-${id}`).click();
        // Descriptions must use live text rather than magnified bitmap lettering.
        await expect(page.locator(".description [data-native-sprite]")).toHaveCount(0);
        panels.push(await page.evaluate(() => {
          const style = (selector: string, pseudo?: string) => getComputedStyle(document.querySelector(selector)!, pseudo);
          const description = style(".description"), hints = style(".hints"), divider = style(".divider");
          const head = style(".head"), separator = style(".menu", "::before");
          return {
            description: [description.fontFamily, description.fontSize, description.lineHeight, description.color, description.right],
            hints: [hints.fontFamily, hints.fontWeight, hints.fontSize],
            divider: [divider.width, divider.backgroundColor],
            header: [head.height, head.borderBottomWidth, head.borderBottomColor],
            year: style(".header-year-art").height, subtitle: style(".header-subtitle-art").height,
            separator: [separator.content, separator.borderTopWidth, separator.borderTopColor],
          };
        }));
      }
      expect(panels[0]).toEqual(panels[1]);
      expect(panels[0]).toEqual(panels[2]);
    }
  });

  test("native header rule endpoints remain fixed across MGS1, MGS2 and MGS3", async () => {
    for (const width of [1920, 3840]) {
      await page.setViewportSize({ width, height: width * 9 / 16 });
      const positions: { x: number; y: number }[][] = [];
      for (const id of ["mgs1", "mgs2", "mgs3"]) {
        await page.keyboard.press("Tab");
        await page.getByTestId(`tile-${id}`).click();
        positions.push(await page.locator(".header-mark-art > :is(img, svg)").evaluate(async element => {
          // Reference ink coordinates, measured from the original 309x122 marks.
          const points = [{ x: 234, y: 0 }, { x: 308, y: 91 }, { x: 20, y: 102 }];
          if (element instanceof SVGSVGElement) {
            const matrix = element.getScreenCTM()!;
            return points.map(point => {
              const projected = new DOMPoint(point.x + 420, point.y + 336).matrixTransform(matrix);
              return { x: projected.x, y: projected.y };
            });
          }
          const image = element as HTMLImageElement;
          await image.decode();
          const rect = image.getBoundingClientRect();
          const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
          const x = rect.right - image.naturalWidth * scale;
          const y = rect.bottom - image.naturalHeight * scale;
          return points.map(point => ({ x: x + point.x * scale, y: y + point.y * scale }));
        }));
      }
      for (const points of positions.slice(1)) for (let i = 0; i < points.length; i++) {
        expect(Math.abs(points[i].x - positions[0][i].x)).toBeLessThan(0.1);
        expect(Math.abs(points[i].y - positions[0][i].y)).toBeLessThan(0.1);
      }
    }
  });
  test("portraits retain their geometry when opening Options at HD, 4K, and windowed aspect ratios", async () => {
    await expect(page.getByTestId("game-screen")).toBeVisible();
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }, { width: 1600, height: 850 }]) {
      await page.setViewportSize(viewport);
      for (const id of ["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]) {
        await page.keyboard.press("Tab");
        await page.getByTestId(`tile-${id}`).click();
        const portraits = page.locator(".main-visual, .chapter-visual");
        const geometry = () => portraits.evaluateAll(images => images.map(image => {
          const rect = image.getBoundingClientRect();
          const style = getComputedStyle(image);
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            fit: style.objectFit, position: style.objectPosition, transform: style.transform };
        }));
        const main = await geometry();
        const portraitNodes = await portraits.elementHandles();
        const fontsBefore = await page.evaluate(() => document.fonts.size);
        if (id === "mgs1") {
          expect(main[0].fit).toBe("contain");
          expect(main[0].x / viewport.width).toBeCloseTo(115 / 1920, 4);
          expect(main[0].y / viewport.height).toBeCloseTo(2 / 1080, 4);
          expect(main[0].width / viewport.width).toBeCloseTo(1102 / 1920, 4);
          expect(main[0].height / viewport.height).toBeCloseTo(1082 / 1080, 3);
        }
        await page.getByTestId("menu-item-options").click();
        await expect(page.getByTestId("settings-screen")).toBeVisible();
        await expect(page.getByText("Loading settings...", { exact: true })).toHaveCount(0);
        expect(await geometry()).toEqual(main);
        for (const node of portraitNodes) expect(await node.evaluate(image => image.isConnected)).toBe(true);
        await expect(page.locator('.persistent-backdrop .left-zone')).toHaveCSS("opacity", "1");
        await expect(page.locator('.persistent-backdrop .left-zone')).toHaveCSS("animation-name", "none");
        expect(await page.evaluate(() => document.fonts.size)).toBe(fontsBefore);
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("game-screen")).toBeVisible();
        for (const node of portraitNodes) expect(await node.evaluate(image => image.isConnected)).toBe(true);
        await expect(page.locator('.persistent-backdrop .left-zone')).toHaveCSS("opacity", "1");
        await page.keyboard.press("Tab");
        await expect(page.getByTestId("game-selection")).toBeVisible();
        for (const node of portraitNodes) expect(await node.evaluate(image => image.isConnected)).toBe(true);
        await page.keyboard.press("Escape");
      }
    }
  });

  test("Peace Walker motion plays, respects reduced motion, and leaves with its screen", async () => {
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgspw").click();
    await expect(page.locator(".reticle")).toHaveCount(3);
    await expect(page.locator(".mech-frame")).toHaveCount(3);
    const ring = page.locator(".reticle").first();
    const initial = await ring.evaluate(element => getComputedStyle(element).transform);
    await expect.poll(() => ring.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(ring).toHaveCSS("animation-play-state", "paused");
    // CSS updates before the compositor commits the pending pause operation.
    await ring.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.ready)));
    const paused = await ring.evaluate(element => getComputedStyle(element).transform);
    await page.waitForTimeout(200);
    expect(await ring.evaluate(element => getComputedStyle(element).transform)).toBe(paused);
    await expect(page.locator(".mech-frame").first()).toHaveCSS("animation-play-state", "paused");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs1").click();
    await expect(page.locator(".pw-motion")).toHaveCount(0);
  });

  test("MGS2 settings animation plays, pauses for reduced motion, and leaves with the overview", async () => {
    await page.keyboard.press("Tab");
    await page.getByTestId("tile-mgs2").click();
    await page.getByTestId("menu-item-options").click();
    const pattern = page.getByTestId("mgs2-settings-pattern");
    await expect(pattern).toHaveAttribute("data-motion", "running");
    await expect(pattern).not.toHaveAttribute("data-cycle", "0", { timeout: 10_000 });
    await page.keyboard.press("ArrowDown");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(pattern).toHaveAttribute("data-motion", "paused");
    const still = await pattern.evaluate(element => [element.getAttribute("style"), element.getAttribute("src")]);
    await page.waitForTimeout(250);
    expect(await pattern.evaluate(element => [element.getAttribute("style"), element.getAttribute("src")])).toEqual(still);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(pattern).toHaveAttribute("data-cycle", "0");
    await expect(pattern).toHaveCSS("opacity", "0");
    await expect(pattern).not.toHaveAttribute("data-cycle", "0", { timeout: 10_000 });
    await page.getByRole("button", { name: "Community Fixes", exact: true }).click();
    await expect(pattern).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("game-screen")).toHaveAttribute("data-game", "mgs2");
    await expect(pattern).toHaveCount(0);
  });
});
