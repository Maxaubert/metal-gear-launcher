// Minimising a BrowserWindow created with fullscreen:true is a documented Electron/Windows rough
// edge: firing minimize() (or setFullScreen(true) on restore) back-to-back with setFullScreen()
// without waiting for the transition to finish can leave a stuck black frame instead of behaving
// like a normal minimize/restore. setFullScreen() and minimize()/restore() are asynchronous on
// Windows, so each step here waits for the previous transition's event before firing the next.
//
// Confirmed on-machine (real BrowserWindow, not a mock, 2026-09-06): waiting for the event is
// necessary but not sufficient. Calling the next native window method (minimize(), focus(),
// setFullScreen()) *synchronously* from inside the previous event's handler is itself unreliable:
// the OS is still mid-transition when the event fires, so the immediate follow-up call is silently
// dropped (setFullScreen(false) took effect but the chained minimize() never actually minimized the
// window in repeated trials). Deferring each follow-up call by one macrotask (setTimeout(fn, 0))
// after the event fires reliably fixed it in the same repeated trials. Do not remove the deferral.
export type WinLike = {
  isFullScreen(): boolean;
  setFullScreen(flag: boolean): void;
  minimize(): void;
  restore(): void;
  focus(): void;
  once(event: "leave-full-screen" | "enter-full-screen" | "restore", cb: () => void): void;
};

/**
 * Minimises `win` for a launched game. Returns whether the window was fullscreen beforehand, so
 * the caller can restore symmetrically with {@link restoreAfterLaunch}.
 */
export function minimizeForLaunch(win: WinLike): boolean {
  const wasFullScreen = win.isFullScreen();
  if (wasFullScreen) {
    win.once("leave-full-screen", () => setTimeout(() => win.minimize(), 0));
    win.setFullScreen(false);
  } else {
    win.minimize();
  }
  return wasFullScreen;
}

/** Restores `win` after a launched game exits. `wasFullScreen` is minimizeForLaunch's return value. */
export function restoreAfterLaunch(win: WinLike, wasFullScreen: boolean): void {
  win.once("restore", () => {
    if (wasFullScreen) {
      win.once("enter-full-screen", () => setTimeout(() => win.focus(), 0));
      setTimeout(() => win.setFullScreen(true), 0);
    } else {
      setTimeout(() => win.focus(), 0);
    }
  });
  win.restore();
}
