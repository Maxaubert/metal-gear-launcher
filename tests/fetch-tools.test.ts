import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

describe.skipIf(process.platform !== "win32")("pinned extraction tool download", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hub-tool-download-"));
    await mkdir(join(root, "scripts"));
    await copyFile(resolve("scripts/fetch-tools.ps1"), join(root, "scripts/fetch-tools.ps1"));
    await copyFile(resolve("scripts/vgmstream-sources.txt"), join(root, "vgmstream-sources.txt"));
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function download(mode: string) {
    const harness = join(root, "fixture.ps1");
    await writeFile(harness, `param([string]$Mode)
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'resources/tools'
$destination = Join-Path $root 'vgmstream'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Set-Content -LiteralPath (Join-Path $destination 'vgmstream-cli.exe') -Value 'old-runtime'
$tree = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'scripts/fetch-tools.ps1'), [ref]$null, [ref]$null)
$functions = $tree.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
$fixtureScriptRoot = $PSScriptRoot
foreach ($function in $functions) { Invoke-Expression $function.Extent.Text.Replace('$PSScriptRoot', '$fixtureScriptRoot') }
$global:fixtureZip = Join-Path $PSScriptRoot 'fixture.zip'
$zip = [IO.Compression.ZipFile]::Open($global:fixtureZip, [IO.Compression.ZipArchiveMode]::Create)
$files = @('vgmstream-cli.exe', 'COPYING')
if ($Mode -ne 'missing-runtime') { $files += 'codec.dll' }
foreach ($file in $files) {
  $writer = [IO.StreamWriter]::new($zip.CreateEntry($file).Open())
  $writer.Write('new-runtime'); $writer.Dispose()
}
$zip.Dispose()
function global:gh {
  $global:LASTEXITCODE = 0
  if ($args[1] -eq 'view') {
    if ($args -notcontains 'pinned-release') { throw 'Release tag was not passed to lookup' }
    return '{"tagName":"pinned-release","assets":[{"name":"fixture.zip"}]}'
  }
  if ($args[2] -ne 'pinned-release') { throw 'Download did not use the pinned release' }
  Copy-Item -LiteralPath $global:fixtureZip -Destination $args[([array]::IndexOf($args, '-O') + 1)]
}
function global:Invoke-WebRequest { param($Uri, $OutFile)
  if ($Uri -ne 'https://raw.githubusercontent.com/vgmstream/vgmstream/pinned-release/ext_libs/licenses/license.txt') { throw 'Unexpected license source' }
  Set-Content -LiteralPath $OutFile -Value 'upstream-license'
}
$hash = (Get-FileHash -LiteralPath $global:fixtureZip -Algorithm SHA256).Hash
if ($Mode -eq 'bad-hash') { $hash = '0' * 64 }
Get-Release 'vgmstream/vgmstream' 'fixture.zip' $destination @('vgmstream-cli.exe', 'codec.dll', 'COPYING') 'pinned-release' $hash @('license.txt')
`);
    return spawnSync("pwsh", ["-NoProfile", "-File", harness, mode], { encoding: "utf8" });
  }

  it("verifies and stages the runtime, codec dependencies and license notices before replacement", async () => {
    const result = await download("complete");
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(root, "resources/tools/vgmstream/vgmstream-cli.exe"), "utf8")).toBe("new-runtime");
    expect(await readFile(join(root, "resources/tools/vgmstream/LICENSES/license.txt"), "utf8")).toContain("upstream-license");
    expect(await readFile(join(root, "resources/tools/vgmstream/LICENSES/SOURCES.txt"), "utf8")).toContain("r2117");
  });

  it.each(["bad-hash", "missing-runtime"])("preserves the existing decoder when validation fails: %s", async mode => {
    const result = await download(mode);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(mode === "bad-hash" ? "Checksum mismatch" : "Release is missing codec.dll");
    expect(await readFile(join(root, "resources/tools/vgmstream/vgmstream-cli.exe"), "utf8")).toContain("old-runtime");
  });
});
