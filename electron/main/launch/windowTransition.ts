// Minimising a BrowserWindow created with fullscreen:true is a documented Electron/Windows rough
// edge: firing minimize() (or setFullScreen(true) on restore) back-to-back with setFullScreen()
// without waiting for the transition to finish can leave a stuck black frame instead of behaving
// like a normal minimize/restore. setFullScreen() and minimize()/restore() are asynchronous on
// Windows, so each step here waits for the previous transition's event before firing the next.
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
    win.once("leave-full-screen", () => win.minimize());
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
      win.once("enter-full-screen", () => win.focus());
      win.setFullScreen(true);
    } else {
      win.focus();
    }
  });
  win.restore();
}
