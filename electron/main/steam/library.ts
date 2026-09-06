import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type VdfNode = { [key: string]: string | VdfNode };

export function parseVdf(text: string): VdfNode {
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}]/g) ?? [];
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
  const root = parseVdf(text).libraryfolders as VdfNode;
  return Object.values(root)
    .filter((v): v is VdfNode => typeof v === "object")
    .map((v) => v.path as string);
}

export function installFromManifest(text: string): { installdir: string; buildid: string } {
  const s = parseVdf(text).AppState as VdfNode;
  return { installdir: s.installdir as string, buildid: s.buildid as string };
}

export async function findSteamRoot(override?: string): Promise<string | null> {
  // `HUB_STEAM_ROOT` outranks both the configured path and the registry lookup so e2e tests
  // can point the hub at a fake Steam install regardless of what's on the machine running them.
  const candidates = [process.env.HUB_STEAM_ROOT, override, await registrySteamPath(), "C:\\Program Files (x86)\\Steam"].filter(
    Boolean,
  ) as string[];
  for (const c of candidates) {
    try {
      await readFile(join(c, "steamapps", "libraryfolders.vdf"));
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}

async function registrySteamPath(): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)("reg", [
      "query",
      "HKCU\\Software\\Valve\\Steam",
      "/v",
      "SteamPath",
    ]);
    const m = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
    const value = m?.[1];
    return value !== undefined ? value.trim().replace(/\//g, "\\") : null;
  } catch {
    return null;
  }
}

export async function listLibraries(steamRoot: string): Promise<string[]> {
  return librariesFromVdf(await readFile(join(steamRoot, "steamapps", "libraryfolders.vdf"), "utf8"));
}
