import { afterEach, expect, it, vi } from "vitest";
import { findSteamRoot } from "../../electron/main/steam/library";

const registry = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: Object.assign(vi.fn(), {
  [Symbol.for("nodejs.util.promisify.custom")]: registry,
}) }));
vi.mock("node:fs/promises", () => ({ stat: vi.fn(async () => ({ isFile: () => true })), readFile: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("shares concurrent registry discovery but discovers again after it finishes", async () => {
  vi.stubEnv("HUB_STEAM_ROOT", "");
  let complete!: (value: { stdout: string }) => void;
  registry.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const pending = Array.from({ length: 6 }, () => findSteamRoot());
  expect(registry).toHaveBeenCalledTimes(1);
  complete({ stdout: "C:\\Custom Steam\n" });
  expect(await Promise.all(pending)).toEqual(Array(6).fill("C:\\Custom Steam"));
  registry.mockResolvedValue({ stdout: "D:\\Moved Steam\n" });
  expect(await findSteamRoot()).toBe("D:\\Moved Steam");
  expect(registry).toHaveBeenCalledTimes(2);
});
