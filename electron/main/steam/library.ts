import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type VdfNode = { [key: string]: string | VdfNode };

export function parseVdf(text: string): VdfNode {
  const tokens = (text.match(/\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}]/g) ?? []).filter(token => !token.startsWith("//"));
  let i = 0;
  const parseBlock = (): VdfNode => {
    const node: VdfNode = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t === undefined || t === "}") return node;
      const key = t.slice(1, -1).replace(/\\\\/g, "\\");
      const next = tokens[i++];
      if (next === undefined) return node;
      if (next === "{") node[key] = parseBlock();
      else node[key] = next.slice(1, -1).replace(/\\\\/g, "\\");
    }
    return node;
  };
  return parseBlock();
}

export function librariesFromVdf(text: string): string[] {
  const root = Object.entries(parseVdf(text)).find(([key]) => key.toLowerCase() === "libraryfolders")?.[1];
  if (!root || typeof root === "string") return [];
  return Object.entries(root).filter(([key]) => /^\d+$/.test(key))
    .map(([, value]) => typeof value === "string" ? value : value.path)
    .filter((path): path is string => typeof path === "string" && isAbsolute(path));
}

export function installFromManifest(text: string): { installdir: string; buildid: string } {
  const s = Object.entries(parseVdf(text)).find(([key]) => key.toLowerCase() === "appstate")?.[1];
  if (!s || typeof s === "string" || typeof s.installdir !== "string" || !s.installdir.trim()
    || isAbsolute(s.installdir) || s.installdir.split(/[\\/]/).includes("..")
    || typeof s.buildid !== "string" || !/^\d+$/.test(s.buildid)) throw new Error("Invalid Steam install manifest");
  return { installdir: s.installdir, buildid: s.buildid };
}

export async function findSteamRoot(override?: string): Promise<string | null> {
  // `HUB_STEAM_ROOT` outranks both the configured path and the registry lookup so e2e tests
  // can point the hub at a fake Steam install regardless of what's on the machine running them.
  if (process.env.HUB_STEAM_ROOT) return await isSteamRoot(process.env.HUB_STEAM_ROOT) ? process.env.HUB_STEAM_ROOT : null;
  if (override && await isSteamRoot(override)) return override;
  const candidates = [await registrySteamPath(),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"]!, "Steam"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Steam"), "C:\\Program Files (x86)\\Steam"].filter(Boolean) as string[];
  for (const c of candidates) {
    if (await isSteamRoot(c)) return c;
  }
  return null;
}

async function isSteamRoot(path: string): Promise<boolean> {
  if (!isAbsolute(path)) return false;
  for (const file of ["steamapps/libraryfolders.vdf", "config/libraryfolders.vdf", "steam.exe"]) {
    try { if ((await stat(join(path, file))).isFile()) return true; } catch { /* next */ }
  }
  return false;
}

let pendingRegistryPath: Promise<string | null> | undefined;

function registrySteamPath(): Promise<string | null> {
  // Startup asks for settings, books and music concurrently. Share only the active
  // registry query so they do not launch competing PowerShell processes.
  return pendingRegistryPath ??= readRegistrySteamPath().finally(() => { pendingRegistryPath = undefined; });
}

async function readRegistrySteamPath(): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
      "-NoProfile", "-NonInteractive", "-Command",
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Get-ItemPropertyValue -LiteralPath 'HKCU:\\Software\\Valve\\Steam' -Name SteamPath -ErrorAction Stop",
    ], { windowsHide: true, timeout: 5000 });
    return stdout.trim().replace(/\//g, "\\") || null;
  } catch {
    return null;
  }
}

export async function listLibraries(steamRoot: string): Promise<string[]> {
  let libraries: string[] = [];
  for (const folder of ["steamapps", "config"]) {
    try { libraries = librariesFromVdf(await readFile(join(steamRoot, folder, "libraryfolders.vdf"), "utf8")); break; }
    catch { /* Fresh Steam installs may not yet have a library list. The root is still a library. */ }
  }
  const unique = new Map<string, string>();
  for (const path of [steamRoot, ...libraries]) unique.set(normalize(path).toLowerCase(), path);
  return [...unique.values()];
}
