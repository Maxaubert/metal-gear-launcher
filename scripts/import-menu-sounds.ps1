param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'MGSMasterHub\sounds')
)
$ErrorActionPreference = 'Stop'
$sourceFile = (Resolve-Path -LiteralPath $Source).Path
$null = Get-Command ffmpeg -ErrorAction Stop
$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
$outputRoot = (Resolve-Path -LiteralPath $OutputDirectory).Path

# These times correspond to the user's 30-second labeled MGS menu-sounds reference.
# Retain the quiet decay after each effect, with only a few milliseconds before its attack.
# No recording or extracted game assets are stored in the repository or installer.
$clips = @(
  @{ Name = 'start'; Start = 0.790; End = 3.000; Label = 'Start Game / Load Game' },
  @{ Name = 'navigate'; Start = 5.115; End = 5.550; Label = 'Navigating Menu' },
  @{ Name = 'select'; Start = 10.813; End = 11.600; Label = 'Select' },
  @{ Name = 'back'; Start = 14.040; End = 15.600; Label = 'Exit' },
  @{ Name = 'options'; Start = 16.958; End = 19.000; Label = 'Briefing Files / Options' },
  @{ Name = 'adjust'; Start = 21.004; End = 21.850; Label = 'Options Select' },
  @{ Name = 'vr'; Start = 25.655; End = 26.500; Label = 'VR Mission Select' }
)
foreach ($clip in $clips) {
  $destination = Join-Path $outputRoot ($clip.Name + '.wav')
  $start = $clip.Start.ToString('F3', [Globalization.CultureInfo]::InvariantCulture)
  $duration = ($clip.End - $clip.Start).ToString('F3', [Globalization.CultureInfo]::InvariantCulture)
  & ffmpeg -hide_banner -loglevel error -y -i $sourceFile -ss $start -t $duration -vn -c:a pcm_s16le $destination
  if ($LASTEXITCODE -ne 0) { throw "Could not extract $($clip.Label)." }
}
@{ Source = (Split-Path -Leaf $sourceFile); SHA256 = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash; Clips = $clips } |
  ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputRoot 'source.json') -Encoding utf8
Write-Output "Imported seven menu sounds into $outputRoot"
