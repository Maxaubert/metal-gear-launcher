import type { NativeGameId } from "./nativeSchemas";

export type NativeDisplayContext = { width: number; height: number; label: string };

export function displayResolutionLevel(display: NativeDisplayContext): number {
  if (display.width >= 3840 && display.height >= 2160) return 3;
  if (display.width >= 2560 && display.height >= 1440) return 2;
  if (display.width >= 1920 && display.height >= 1080) return 1;
  return 0;
}

// Exact native MGS4 WallPaperUI list and its windowResolution index subset.
const MGS4_RESOLUTIONS = [
  [1280, 720], [1280, 768], [1280, 800], [1360, 768], [1366, 768],
  [1280, 960], [1600, 900], [1440, 1080], [1600, 1024], [1680, 1050],
  [1600, 1200], [1920, 1080], [2048, 1080], [1920, 1200], [1920, 1440],
  [2048, 1536], [2560, 1440], [2560, 1600], [3840, 2160],
] as const;
const WINDOW_INDICES = [0, 4, 6, 11, 16, 18];

export function mgs4ResolutionOptions(display: NativeDisplayContext, windowed: boolean) {
  return MGS4_RESOLUTIONS.map(([width, height], index) => ({ value: index + 1, label: `${width}*${height}`, width, height }))
    .filter(({ width, height, value }) => width <= display.width && height <= display.height && (!windowed || WINDOW_INDICES.includes(value - 1)));
}

export function presetGraphics(gameId: NativeGameId, preset: number, display: NativeDisplayContext) {
  const level = displayResolutionLevel(display);
  if (preset === 0) return { render: 0, upscale: 0, movie: 0, texture: 0 };
  if (preset === 1) return { render: Math.min(1, level), upscale: level, movie: gameId === "mgspw" ? 0 : 1, texture: 0 };
  if (preset === 3 && gameId === "mgspw") return { render: Math.min(1, level), upscale: level, movie: 1, texture: 0 };
  throw new Error("This automatic preset requires an unverified native DLC check");
}

export async function readNativeDisplayContext(): Promise<NativeDisplayContext | undefined> {
  try {
    const { screen } = await import("electron");
    const displays = screen.getAllDisplays();
    // Electron and Unity do not document identical multi-monitor ordering.
    // A sole physical display gives an unambiguous native MonitorIndex of zero.
    if (displays.length !== 1 || displays[0]!.id === -1 || displays[0]!.id === -10) return undefined;
    const display = displays[0]!;
    const width = Math.round(display.size.width * display.scaleFactor);
    const height = Math.round(display.size.height * display.scaleFactor);
    if (width < 1 || height < 1) return undefined;
    return { width, height, label: display.label || "Display 1" };
  } catch { return undefined; }
}
