# Downloads extraction tools into resources/tools (not committed).
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
function Get-Release($repo, $pattern, $dest, $expected, $tag = '', $sha256 = '', $licenses = @()) {
  $dest = Assert-ToolPath $dest
  $viewArgs = @('release', 'view', '-R', $repo, '--json', 'tagName,assets')
  if ($tag) { $viewArgs += $tag }
  $rel = gh @viewArgs | ConvertFrom-Json
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
    if ($sha256 -and (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $sha256) {
      throw "Checksum mismatch for $repo $($rel.tagName) $($asset.name)"
    }
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
    foreach ($required in $expected) {
      if (-not (Test-Path -LiteralPath (Join-Path $staged $required) -PathType Leaf)) { throw "Release is missing $required" }
    }
    if ($licenses.Count) {
      $notices = Assert-ToolPath (Join-Path $staged 'LICENSES')
      New-Item -ItemType Directory -Path $notices | Out-Null
      foreach ($license in $licenses) {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$repo/$tag/ext_libs/licenses/$license" -OutFile (Join-Path $notices $license)
      }
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'vgmstream-sources.txt') -Destination (Join-Path $notices 'SOURCES.txt')
    }
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
Get-Release "aelurum/AssetStudio" "AssetStudioModCLI_net472_win32_64*.zip" (Join-Path $root "AssetStudioModCLI") @('AssetStudioModCLI.exe')
Get-Release "UlyssesWu/FreeMote" "Ulysses-FreeMoteToolkit-*.zip" (Join-Path $root "FreeMote") @('PsbDecompile.exe')
# Official x64 CLI plus its dynamic codec libraries. Pin the runtime used by native audio extraction.
$vgmstreamFiles = @('vgmstream-cli.exe', 'COPYING', 'README.md',
  'avcodec-vgmstream-59.dll', 'avformat-vgmstream-59.dll', 'avutil-vgmstream-57.dll',
  'swresample-vgmstream-4.dll', 'libatrac9.dll', 'libcelt-0061.dll', 'libcelt-0110.dll',
  'libg719_decode.dll', 'libmpg123-0.dll', 'libspeex-1.dll', 'libvorbis.dll')
$vgmstreamLicenses = @('LibAtrac9.LICENSE', 'celt-0.11.0.COPYING', 'celt-0.6.1.COPYING',
  'ffmpeg.COPYING.LGPLv2.1', 'ffmpeg.COPYING.LGPLv3', 'libogg-1.3.5.COPYING',
  'libvorbis-1.3.7.COPYING', 'mpg123-1.31.1.COPYING', 'opus-1.3.1.COPYING', 'speex-1.2.1.COPYING')
Get-Release 'vgmstream/vgmstream' 'vgmstream-win64.zip' (Join-Path $root 'vgmstream') $vgmstreamFiles 'r2117' '6c4a8a3813864fefed081bbd337dbc0ad93bf88e0b92f5db98d7ab258b22dc6c' $vgmstreamLicenses
$licenseDir = New-Item -ItemType Directory -Force (Join-Path $root "LICENSES")
# vgmstream retains its own named notices and README. Do not flatten them into
# the legacy shared folder, where generic names could overwrite another tool's docs.
$vgmstreamRoot = (Join-Path $root 'vgmstream') + [IO.Path]::DirectorySeparatorChar
Get-ChildItem $root -Recurse -File -Include *LICENSE*,*.md |
  Where-Object { $_.DirectoryName -ne $licenseDir.FullName -and -not $_.FullName.StartsWith($vgmstreamRoot, [StringComparison]::OrdinalIgnoreCase) } |
  Copy-Item -Destination $licenseDir.FullName -Force
Write-Host "tools ready under $root"
