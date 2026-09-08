export const MENU_SOUNDS = ["navigate", "select", "back", "options", "adjust", "start", "vr"] as const;
export type MenuSound = typeof MENU_SOUNDS[number];
// WAV data is loaded once at startup, so playing a sound never needs disk or IPC.
export type MenuSoundData = Partial<Record<MenuSound, string>>;
