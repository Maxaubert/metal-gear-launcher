import { describe, expect, it, vi } from "vitest";
import { displayResolutionLevel, mgs4ResolutionOptions, readNativeDisplayContext } from "../electron/main/settings/nativeDisplay";

const { getAllDisplays } = vi.hoisted(() => ({ getAllDisplays: vi.fn() }));
vi.mock("electron", () => ({ screen: { getAllDisplays } }));

describe("native display context", () => {
  it("converts Electron DIP dimensions to native pixels", async () => {
    getAllDisplays.mockReturnValue([{ id: 1, label: "OLED", size: { width: 1920, height: 1080 }, scaleFactor: 2 }]);
    expect(await readNativeDisplayContext()).toEqual({ width: 3840, height: 2160, label: "OLED" });
  });
  it("does not guess Unity monitor indices for multiple or virtual displays", async () => {
    getAllDisplays.mockReturnValue([{ id: 1 }, { id: 2 }]);
    expect(await readNativeDisplayContext()).toBeUndefined();
    getAllDisplays.mockReturnValue([{ id: -1 }]);
    expect(await readNativeDisplayContext()).toBeUndefined();
  });
  it("uses the exact native window subset and display bounds", () => {
    const display = { width: 1920, height: 1080, label: "Test" };
    expect(mgs4ResolutionOptions(display, true).map(option => [option.width, option.height])).toEqual([
      [1280, 720], [1366, 768], [1600, 900], [1920, 1080],
    ]);
    expect(mgs4ResolutionOptions(display, false).some(option => option.width === 1280 && option.height === 768)).toBe(true);
    expect(displayResolutionLevel({ ...display, width: 3840 })).toBe(1);
  });
});
