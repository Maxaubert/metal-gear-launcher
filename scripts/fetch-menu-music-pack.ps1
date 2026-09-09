param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$Sha256,
  [string]$Output = (Join-Path $PSScriptRoot '..\resources\menu-music')
)
$ErrorActionPreference = 'Stop'
$uri = [uri]$Url
if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or $uri.UserInfo) { throw 'Music packs must use an HTTPS GitHub release URL.' }
$outputRoot = [IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $outputRoot) {
  if (Get-ChildItem -LiteralPath $outputRoot -Recurse -File -Filter '*.mp3') { throw 'Music output already contains tracks. Use a clean output folder to avoid mixing pack versions.' }
}
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('metal-gear-music-' + [guid]::NewGuid().ToString() + '.zip')
try {
  Invoke-WebRequest -Uri $uri -OutFile $temporary
  if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Sha256) { throw 'Music pack checksum does not match the approved pack.' }
  $archive = [IO.Compression.ZipFile]::OpenRead($temporary)
  try {
    $files = @($archive.Entries | Where-Object { $_.Name })
    if (-not $files.Count) { throw 'The music pack is empty.' }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $total = 0L
    foreach ($entry in $files) {
      if ($entry.FullName -notmatch '^(mg12|mgs1|mgs2|mgs3|mgs4|mgspw)/[^/\\:]+\.mp3$' -or -not $seen.Add($entry.FullName)) {
        throw "Invalid or duplicate music pack entry: $($entry.FullName)"
      }
      $total += $entry.Length
      if ($entry.Length -gt 256MB -or $total -gt 1GB -or $files.Count -gt 1000) { throw 'Music pack exceeds supported size limits.' }
    }
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    foreach ($entry in $files) {
      $target = Join-Path $outputRoot $entry.FullName
      New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
    Write-Output "Prepared $($files.Count) music tracks from verified pack ($total bytes)."
  } finally { $archive.Dispose() }
} finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
