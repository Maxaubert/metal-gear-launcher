# Local first-run testing only. Release installers continue to preserve user data.
[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $repoRoot "dist\MetalGearLauncher-Setup-x64-$version.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Build the $version installer before installing: $installer" }
if (Get-Process -Name 'Metal Gear Launcher' -ErrorAction SilentlyContinue) { throw 'Close Metal Gear Launcher before a clean installation.' }
if (-not $env:LOCALAPPDATA -or -not $env:APPDATA) { throw 'Windows application-data folders are unavailable.' }

$localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
$roamingRoot = [IO.Path]::GetFullPath($env:APPDATA)
$targets = @(
    @{ Root = $localRoot; Name = 'MGSMasterHub'; BackupName = 'launcher-data' },
    @{ Root = $roamingRoot; Name = 'MGS Master Hub'; BackupName = 'chromium-profile' }
)
$backupRoot = Join-Path $localRoot 'MetalGearLauncher-install-backups'
$backup = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
foreach ($target in $targets) {
    $target.Path = [IO.Path]::GetFullPath((Join-Path $target.Root $target.Name))
    if ([IO.Path]::GetDirectoryName($target.Path) -ne $target.Root -or [IO.Path]::GetFileName($target.Path) -ne $target.Name) { throw 'Unsafe launcher data path.' }
    if (Test-Path -LiteralPath $target.Path) {
        $entry = Get-Item -LiteralPath $target.Path -Force
        if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing a redirected or non-directory data path: $($target.Path)" }
    }
}
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($backupRoot)) -ne $localRoot) { throw 'Unsafe backup path.' }
if ((Test-Path -LiteralPath $backupRoot) -and ((Get-Item -LiteralPath $backupRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing a redirected backup folder.' }

if (-not $PSCmdlet.ShouldProcess('Metal Gear Launcher local data and Chromium profile', "Archive existing state to $backup and install $version fresh")) { return }
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Write-Output "Archiving previous launcher files to: $backup"
foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target.Path) {
        # Both source and destination are checked before moving any directory tree.
        $destination = [IO.Path]::GetFullPath((Join-Path $backup $target.BackupName))
        if ([IO.Path]::GetDirectoryName($destination) -ne [IO.Path]::GetFullPath($backup)) { throw 'Unsafe backup destination.' }
        Move-Item -LiteralPath $target.Path -Destination $destination
    }
}
Write-Output "Previous launcher files preserved at: $backup"
$process = Start-Process -FilePath $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode). Previous files remain in $backup." }
foreach ($target in $targets) {
    if ((Test-Path -LiteralPath $target.Path) -and (Get-ChildItem -LiteralPath $target.Path -Force | Select-Object -First 1)) { throw "The installer unexpectedly populated $($target.Path). Inspect before first-run testing." }
}
Write-Output "Installed $version with no launcher configuration, reading history, extracted content or browser profile. First launch will prepare the detected library."
