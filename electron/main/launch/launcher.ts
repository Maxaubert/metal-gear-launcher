import { spawn as nodeSpawn } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pack } from "@shared/packs";
import type { Install } from "../steam/resolve";
import { dataDir } from "../paths";

type Deps = { spawn: typeof nodeSpawn; openExternal: (url: string) => Promise<void> | void; waitMs?: number };

export async function launchGame(pack: Pack, install: Install, deps: Deps): Promise<{ via: "exe" | "steam"; pid?: number }> {
  // e2e tests run against fixture "installs" that aren't real executables, so `HUB_FAKE_LAUNCH=1`
  // skips spawning entirely and just records which game would have launched.
  if (process.env.HUB_FAKE_LAUNCH === "1") {
    await mkdir(dataDir(), { recursive: true });
    await appendFile(join(dataDir(), "launch.log"), `${pack.id}\n`);
    return { via: "exe" };
  }
  const steamUrl = `steam://rungameid/${pack.steam.appId}`;
  if (pack.launch.steamOnly) { await deps.openExternal(steamUrl); return { via: "steam" }; }
  const exe = join(install.installDir, pack.launch.exe);
  const cwd = join(install.installDir, pack.launch.cwd);
  const child = deps.spawn(exe, [], { cwd, env: { ...process.env, ...pack.launch.env }, detached: true, stdio: "ignore", windowsHide: false });
  const early = await new Promise<number | null>((resolve) => {
    const t = setTimeout(() => resolve(null), deps.waitMs ?? 3000);
    child.once("exit", (code) => { clearTimeout(t); resolve(code ?? 0); });
    child.once("error", () => { clearTimeout(t); resolve(1); });
  });
  if (early !== null && early !== 0) { await deps.openExternal(steamUrl); return { via: "steam" }; }
  child.unref();
  return { via: "exe", pid: child.pid };
}
