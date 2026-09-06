# Downloads the two MIT extraction tools into resources/tools (not committed).
$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "..\resources\tools"
New-Item -ItemType Directory -Force $root | Out-Null
function Get-Release($repo, $pattern, $dest) {
  $rel = gh release view -R $repo --json tagName,assets | ConvertFrom-Json
  $asset = $rel.assets | Where-Object { $_.name -like $pattern } | Select-Object -First 1
  if (-not $asset) { throw "No asset matching $pattern in $repo $($rel.tagName)" }
  $zip = Join-Path $env:TEMP $asset.name
  gh release download $rel.tagName -R $repo -p $asset.name -O $zip --clobber
  Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
  Expand-Archive $zip -DestinationPath $dest -Force
  # Some release zips wrap their contents in a single top-level folder; flatten it
  # so the exe always lands directly under $dest, matching toolPaths() in tools.ts.
  $entries = Get-ChildItem $dest
  if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) {
    Get-ChildItem $entries[0].FullName -Force | Move-Item -Destination $dest -Force
    Remove-Item $entries[0].FullName -Recurse -Force
  }
  Set-Content (Join-Path $dest "VERSION") $rel.tagName
}
Get-Release "aelurum/AssetStudio" "AssetStudioModCLI_net9_win64*.zip" (Join-Path $root "AssetStudioModCLI")
Get-Release "UlyssesWu/FreeMote" "Ulysses-FreeMoteToolkit-*.zip" (Join-Path $root "FreeMote")
$licenseDir = New-Item -ItemType Directory -Force (Join-Path $root "LICENSES")
Get-ChildItem $root -Recurse -File -Include *LICENSE*,*.md | Where-Object { $_.DirectoryName -ne $licenseDir.FullName } | Copy-Item -Destination $licenseDir.FullName -Force
Write-Host "tools ready under $root"
