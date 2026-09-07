import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { assertNoGameProcesses } from "../electron/main/settings/processGuard";

describe("running-game settings guard", () => {
  const game = join(process.cwd(), "test-install");
  const names = new Set(["game.exe", "config tool.exe"]);
  it("blocks every executable within the selected game, including config tools", () => {
    expect(() => assertNoGameProcesses(game, [{ Name: "Game.exe", ExecutablePath: join(game, "Game.exe") }], names)).toThrow("Close Game.exe");
    expect(() => assertNoGameProcesses(game, [{ Name: "Config Tool.exe", ExecutablePath: join(game, "plugins", "Config Tool.exe") }], names)).toThrow("Close");
  });
  it("does not confuse a sibling installation with a path prefix", () => {
    expect(() => assertNoGameProcesses(game, [{ Name: "Game.exe", ExecutablePath: join(`${game}-other`, "Game.exe") }], names)).not.toThrow();
  });
  it("fails closed for elevated games whose executable path is unavailable", () => {
    expect(() => assertNoGameProcesses(game, [{ Name: "Game.exe", ExecutablePath: null }], names)).toThrow("Close Game.exe");
    expect(() => assertNoGameProcesses(game, [{ Name: "Config Tool.exe" }], names)).toThrow("Close");
    expect(() => assertNoGameProcesses(game, [{ Name: "System", ExecutablePath: null }], names)).not.toThrow();
  });
  it("rejects missing or malformed process-enumeration results", () => {
    for (const value of [null, [], "", {}, [null]]) expect(() => assertNoGameProcesses(game, value, names)).toThrow();
  });
});
