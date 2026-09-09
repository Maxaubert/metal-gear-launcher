import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

describe("music pack build editions", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hub-edition-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it("labels a clean checkout Lite and a supplied music pack Full", async () => {
    await mkdir(join(root, "scripts"));
    const script = join(root, "scripts", "package-launcher.mjs");
    await copyFile(resolve("scripts/package-launcher.mjs"), script);
    const inspect = () => JSON.parse(execFileSync(process.execPath, [script, "--dry-run"], { encoding: "utf8" }));
    expect(inspect()).toMatchObject({ edition: "Lite", musicTracks: 0, artifactName: "MetalGearLauncher-Lite-Setup-x64-${version}.exe" });
    await mkdir(join(root, "resources", "menu-music", "mgs3"), { recursive: true });
    await writeFile(join(root, "resources", "menu-music", "mgs3", "Snake Eater.mp3"), "fixture");
    expect(inspect()).toMatchObject({ edition: "Full", musicTracks: 1, artifactName: "MetalGearLauncher-Full-Setup-x64-${version}.exe" });
  });
});

describe.skipIf(process.platform !== "win32")("verified music pack fetching", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hub-fetch-music-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function fetchFixture(entry: string, badHash = false) {
    const harness = join(root, "fixture.ps1");
    await writeFile(harness, `param([string]$Fetcher, [string]$Entry, [string]$BadHash)
$ErrorActionPreference = 'Stop'
$global:musicTestArchive = Join-Path $PSScriptRoot 'fixture.zip'
$zip = [IO.Compression.ZipFile]::Open($global:musicTestArchive, [IO.Compression.ZipArchiveMode]::Create)
$stream = [IO.StreamWriter]::new($zip.CreateEntry($Entry).Open())
$stream.Write('audio-fixture'); $stream.Dispose(); $zip.Dispose()
function global:Invoke-WebRequest { param($Uri, $OutFile) Copy-Item -LiteralPath $global:musicTestArchive -Destination $OutFile }
$hash = (Get-FileHash -LiteralPath $global:musicTestArchive -Algorithm SHA256).Hash
if ($BadHash -eq 'true') { $hash = '0' * 64 }
& $Fetcher -Url 'https://github.com/example/repo/releases/download/music/pack.zip' -Sha256 $hash -Output (Join-Path $PSScriptRoot 'output')
`);
    return spawnSync("pwsh", ["-NoProfile", "-File", harness, resolve("scripts/fetch-menu-music-pack.ps1"), entry, String(badHash)], { encoding: "utf8" });
  }

  it("verifies the checksum then extracts supported game tracks", async () => {
    const result = await fetchFixture("mgs3/Snake Eater.mp3");
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(root, "output", "mgs3", "Snake Eater.mp3"), "utf8")).toBe("audio-fixture");
  });
  it("fails a checksum mismatch before writing any music", async () => {
    const result = await fetchFixture("mgs3/Snake Eater.mp3", true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("checksum does not match");
    await expect(readFile(join(root, "output", "mgs3", "Snake Eater.mp3"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects archive traversal even when the checksum matches", async () => {
    const result = await fetchFixture("../escaped.mp3");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Invalid or duplicate");
    await expect(readFile(join(root, "escaped.mp3"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
