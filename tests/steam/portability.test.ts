import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findSteamRoot, installFromManifest, librariesFromVdf, listLibraries } from "../../electron/main/steam/library";
import { resolveInstall } from "../../electron/main/steam/resolve";
import { loadPacks } from "../../shared/packs";

const roots: string[] = [];
const quote = (value: string) => `"${value.replace(/\\/g, "\\\\")}"`;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "hub-portability-"));
  roots.push(root);
  const steam = join(root, "Steam Åse 東京");
  const library = join(root, "Spill og prøver 日本語");
  await Promise.all([steam, library].map(path => mkdir(join(path, "steamapps"), { recursive: true })));
  await writeFile(join(steam, "steam.exe"), "fixture");
  vi.stubEnv("HUB_STEAM_ROOT", steam);
  return { root, steam, library };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});

describe("Steam installation portability", () => {
  it("finds only the installed game across Unicode and spaced libraries without community fixes", async () => {
    const { steam, library } = await fixture();
    await writeFile(join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "1" { "path" ${quote(library)} } }`);
    const pack = loadPacks().find(pack => pack.id === "mgs3")!;
    const installDir = join(library, "steamapps", "common", "Snake Eater Å 日本語");
    await mkdir(dirname(join(installDir, pack.launch.exe)), { recursive: true });
    await writeFile(join(installDir, pack.launch.exe), "synthetic executable");
    await writeFile(join(library, "steamapps", `appmanifest_${pack.steam.appId}.acf`), '"AppState" { "installdir" "Snake Eater Å 日本語" "buildid" "123" }');
    const libraries = await listLibraries((await findSteamRoot())!);
    expect(libraries).toEqual([steam, library]);
    const installs = await Promise.all(loadPacks().map(async pack => ({ id: pack.id, install: await resolveInstall(pack, libraries) })));
    expect(installs.filter(entry => entry.install)).toEqual([{ id: "mgs3", install: { installDir, buildId: "123" } }]);
  });

  it("accepts a fresh Steam root with no games or library list", async () => {
    const { steam } = await fixture();
    expect(await findSteamRoot()).toBe(steam);
    expect(await listLibraries(steam)).toEqual([steam]);
    expect(await Promise.all(loadPacks().map(pack => resolveInstall(pack, [steam])))).toEqual(loadPacks().map(() => null));
  });

  it("keeps an absent explicit fixture root isolated from the host Steam installation", async () => {
    const { root } = await fixture();
    vi.stubEnv("HUB_STEAM_ROOT", join(root, "not installed"));
    expect(await findSteamRoot()).toBeNull();
  });

  it("reads legacy config-folder library lists and ignores quoted comments", async () => {
    const { steam, library } = await fixture();
    await mkdir(join(steam, "config"));
    const vdf = `// "misleading" { "path" "bad" }\n"LibraryFolders" { "TimeNextStatsReport" "1" "1" ${quote(library)} }`;
    await writeFile(join(steam, "config", "libraryfolders.vdf"), vdf);
    expect(librariesFromVdf(vdf)).toEqual([library]);
    expect(await listLibraries(steam)).toEqual([steam, library]);
  });

  it("rejects manifest traversal and directories masquerading as executables", async () => {
    expect(() => installFromManifest('"AppState" { "installdir" "../outside" "buildid" "1" }')).toThrow("Invalid Steam install manifest");
    const { steam } = await fixture();
    const pack = loadPacks()[0]!;
    await mkdir(join(steam, "steamapps", "common", "incomplete", pack.launch.exe), { recursive: true });
    await writeFile(join(steam, "steamapps", `appmanifest_${pack.steam.appId}.acf`), '"AppState" { "installdir" "incomplete" "buildid" "1" }');
    expect(await resolveInstall(pack, [steam])).toBeNull();
  });
});
