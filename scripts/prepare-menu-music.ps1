param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$FfmpegPath,
  [Parameter(Mandatory = $true)][string]$Output
)
$ErrorActionPreference = 'Stop'
if (-not $FfmpegPath) {
  $command = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
  if ($command) { $FfmpegPath = $command.Source }
  else {
    # Invoke the binary itself: cmd wrappers can corrupt names containing !.
    $candidates = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\ffmpeg.exe" -ErrorAction SilentlyContinue
    $FfmpegPath = ($candidates | Select-Object -Last 1).FullName
  }
}
if (-not $FfmpegPath -or -not (Test-Path -LiteralPath $FfmpegPath -PathType Leaf) -or [IO.Path]::GetExtension($FfmpegPath) -ne '.exe') {
  throw 'Supply -FfmpegPath pointing to the ffmpeg executable (not a cmd wrapper).'
}
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
$outputRoot = [IO.Path]::GetFullPath($Output)
if ($outputRoot.TrimEnd('\') -eq $sourceRoot.TrimEnd('\')) { throw 'Output must be separate from the original music folder.' }
$games = [ordered]@{ MG = 'mg12'; MGS = 'mgs1'; MGS2 = 'mgs2'; MGS3 = 'mgs3'; MGS4 = 'mgs4'; MGSPW = 'mgspw' }
$converted = 0
$skipped = 0
foreach ($game in $games.GetEnumerator()) {
  $folder = Join-Path $sourceRoot $game.Key
  if (-not (Test-Path -LiteralPath $folder -PathType Container)) { continue }
  $destination = Join-Path $outputRoot $game.Value
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath $folder -File -Filter '*.flac') {
    $target = Join-Path $destination ($file.BaseName + '.mp3')
    if (Test-Path -LiteralPath $target) { $skipped++; continue }
    $temporary = Join-Path $destination (([guid]::NewGuid().ToString()) + '.tmp.mp3')
    try {
      & $FfmpegPath -hide_banner -loglevel error -nostdin -n -i $file.FullName -map 0:a:0 -vn -c:a libmp3lame -b:a 256k -id3v2_version 3 -metadata "title=$($file.BaseName)" $temporary
      if ($LASTEXITCODE -ne 0) { throw "Conversion failed: $($file.Name)" }
      Move-Item -LiteralPath $temporary -Destination $target
      $converted++
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary } }
  }
}
$files = @(Get-ChildItem -LiteralPath $outputRoot -Recurse -File -Filter '*.mp3')
[pscustomobject]@{ Converted = $converted; AlreadyPrepared = $skipped; TotalTracks = $files.Count; Bytes = ($files | Measure-Object -Property Length -Sum).Sum; Output = $outputRoot } | ConvertTo-Json
