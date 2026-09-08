# Downloads the two MIT extraction tools into resources/tools (not committed).
$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\resources\tools"))
New-Item -ItemType Directory -Force $root | Out-Null
function Assert-ToolPath($path) {
  $absolute = [System.IO.Path]::GetFullPath($path)
  if (-not $absolute.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Tool path escapes resources/tools: $absolute"
  }
  return $absolute
}
function Get-Release($repo, $pattern, $dest) {
  $dest = Assert-ToolPath $dest
  $rel = gh release view -R $repo --json tagName,assets | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw "Could not read the latest release for $repo" }
  $asset = $rel.assets | Where-Object { $_.name -like $pattern } | Select-Object -First 1
  if (-not $asset) { throw "No asset matching $pattern in $repo $($rel.tagName)" }
  $work = Assert-ToolPath (Join-Path $root (".download-" + [guid]::NewGuid()))
  $staged = Assert-ToolPath (Join-Path $work "staged")
  $backup = Assert-ToolPath (Join-Path $work "previous")
  $zip = Assert-ToolPath (Join-Path $work "release.zip")
  New-Item -ItemType Directory $work | Out-Null
  try {
    gh release download $rel.tagName -R $repo -p $asset.name -O $zip --clobber
    if ($LASTEXITCODE -ne 0) { throw "Could not download $($asset.name)" }
    Expand-Archive -LiteralPath $zip -DestinationPath $staged -Force
    # Flatten a release's enclosing folder before swapping the verified extraction into place.
    $entries = @(Get-ChildItem -LiteralPath $staged)
    if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) {
      $wrapper = Assert-ToolPath $entries[0].FullName
      Get-ChildItem -LiteralPath $wrapper -Force | ForEach-Object {
        Move-Item -LiteralPath (Assert-ToolPath $_.FullName) -Destination $staged -Force
      }
      Remove-Item -LiteralPath $wrapper -Recurse -Force
    }
    $expected = if ($repo -eq "aelurum/AssetStudio") { "AssetStudioModCLI.exe" } else { "PsbDecompile.exe" }
    if (-not (Test-Path -LiteralPath (Join-Path $staged $expected) -PathType Leaf)) { throw "Release is missing $expected" }
    Set-Content -LiteralPath (Join-Path $staged "VERSION") $rel.tagName
    if (Test-Path -LiteralPath $dest) { Move-Item -LiteralPath $dest -Destination $backup }
    try { Move-Item -LiteralPath $staged -Destination $dest }
    catch {
      if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $dest }
      throw
    }
  } finally {
    # A failed download/extraction leaves the existing tools intact.
    if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $dest)) {
      Write-Warning "Tool restoration failed; previous tools retained at $backup"
    } else {
      Remove-Item -LiteralPath (Assert-ToolPath $work) -Recurse -Force
    }
  }
}
# Match FreeMote's .NET Framework 4.8 baseline on supported Windows PCs; no separate .NET 9 runtime.
Get-Release "aelurum/AssetStudio" "AssetStudioModCLI_net472_win32_64*.zip" (Join-Path $root "AssetStudioModCLI")
Get-Release "UlyssesWu/FreeMote" "Ulysses-FreeMoteToolkit-*.zip" (Join-Path $root "FreeMote")
$licenseDir = New-Item -ItemType Directory -Force (Join-Path $root "LICENSES")
Get-ChildItem $root -Recurse -File -Include *LICENSE*,*.md | Where-Object { $_.DirectoryName -ne $licenseDir.FullName } | Copy-Item -Destination $licenseDir.FullName -Force
Write-Host "tools ready under $root"
