# Routine local upgrades preserve the launcher's profile, library and extraction caches.
[CmdletBinding()]
param([switch]$Unpackaged)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'unpackaged-install.ps1')
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $repoRoot "dist\MetalGearLauncher-Setup-x64-$version.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Build the $version installer before installing." }
if (Get-Process -Name 'Metal Gear Launcher' -ErrorAction SilentlyContinue) { throw 'Close Metal Gear Launcher before installing.' }

if (-not $Unpackaged) {
    $work = Join-Path $repoRoot ('.superpowers\install-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $entry = Join-Path $work 'upgrade.ps1'
    Set-Content -LiteralPath $entry -Value ("& '" + $PSCommandPath.Replace("'", "''") + "' -Unpackaged") -Encoding UTF8
    Invoke-UnpackagedInstallScript -ScriptPath $entry -WorkDirectory $work
    return
}
if (Test-CurrentProcessPackaged) { throw 'Installation must run outside the packaged terminal.' }
$process = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)." }
Write-Output "Installed $version. Existing launcher settings, personal books, music and extraction caches were preserved."
