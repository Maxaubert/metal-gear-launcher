import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { minimizeForLaunch, restoreAfterLaunch, type WinLike } from "../../electron/main/launch/windowTransition";

// Fake BrowserWindow that mimics the real, asynchronous Electron behaviour just enough to catch
// the exact ordering bug this module exists to avoid: setFullScreen() must not be treated as
// synchronous, so a caller that fires minimize()/focus() before the transition event would fail.
// Uses fake timers (see beforeEach/afterEach below) so the async ordering is deterministic
// regardless of the host OS's real timer granularity (observed as low as ~15ms on Windows, which
// made a real-setTimeout version of this fake flaky).
function fakeWin(initiallyFullScreen: boolean) {
  const emitter = new EventEmitter();
  let fullScreen = initiallyFullScreen;
  const win: WinLike & { minimizeCalls: number; restoreCalls: number; focusCalls: number } = {
    minimizeCalls: 0,
    restoreCalls: 0,
    focusCalls: 0,
    isFullScreen: () => fullScreen,
    setFullScreen: (flag) => {
      setTimeout(() => {
        fullScreen = flag;
        emitter.emit(flag ? "enter-full-screen" : "leave-full-screen");
      }, 0);
    },
    minimize: () => { win.minimizeCalls += 1; },
    restore: () => {
      win.restoreCalls += 1;
      setTimeout(() => emitter.emit("restore"), 0);
    },
    focus: () => { win.focusCalls += 1; },
    once: (event, cb) => { emitter.once(event, cb); },
  };
  return win;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("minimizeForLaunch", () => {
  it("minimizes immediately when the window is not fullscreen", () => {
    const win = fakeWin(false);
    const wasFullScreen = minimizeForLaunch(win);
    expect(wasFullScreen).toBe(false);
    expect(win.minimizeCalls).toBe(1);
  });

  it("drops fullscreen before minimizing, and waits for the transition to finish", async () => {
    const win = fakeWin(true);
    const wasFullScreen = minimizeForLaunch(win);
    expect(wasFullScreen).toBe(true);
    // Not minimized yet: the leave-full-screen transition hasn't completed.
    expect(win.minimizeCalls).toBe(0);
    await vi.runAllTimersAsync();
    expect(win.minimizeCalls).toBe(1);
    expect(win.isFullScreen()).toBe(false);
  });
});

describe("restoreAfterLaunch", () => {
  it("focuses immediately once restored, when it was never fullscreen", async () => {
    const win = fakeWin(false);
    restoreAfterLaunch(win, false);
    expect(win.restoreCalls).toBe(1);
    expect(win.focusCalls).toBe(0);
    await vi.runAllTimersAsync();
    expect(win.focusCalls).toBe(1);
    expect(win.isFullScreen()).toBe(false);
  });

  it("re-enters fullscreen after restore, and only focuses once that transition finishes", async () => {
    const win = fakeWin(false);
    restoreAfterLaunch(win, true);
    await vi.runOnlyPendingTimersAsync(); // "restore" fires, setFullScreen(true) starts
    expect(win.focusCalls).toBe(0);
    await vi.runOnlyPendingTimersAsync(); // "enter-full-screen" fires
    expect(win.isFullScreen()).toBe(true);
    expect(win.focusCalls).toBe(1);
  });

  it("is a no-op pairing with minimizeForLaunch's return value (round trip)", async () => {
    const win = fakeWin(true);
    const wasFullScreen = minimizeForLaunch(win);
    await vi.runAllTimersAsync();
    expect(win.isFullScreen()).toBe(false);
    expect(win.minimizeCalls).toBe(1);
    restoreAfterLaunch(win, wasFullScreen);
    await vi.runAllTimersAsync();
    expect(win.isFullScreen()).toBe(true);
    expect(win.focusCalls).toBe(1);
  });
});
