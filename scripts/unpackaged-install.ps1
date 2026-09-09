# A terminal can inherit AppData redirection without reporting its own package identity.
# Always dispatch local installations through Task Scheduler; identity is a worker check only.
function Test-CurrentProcessPackaged {
    if (-not ('LauncherPackageIdentity' -as [type])) {
        Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class LauncherPackageIdentity {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetCurrentPackageFullName(ref uint length, StringBuilder name);
}
'@
    }
    [uint32]$length = 0
    $result = [LauncherPackageIdentity]::GetCurrentPackageFullName([ref]$length, $null)
    if ($result -eq 15700) { return $false } # APPMODEL_ERROR_NO_PACKAGE
    if ($result -eq 122) { return $true } # ERROR_INSUFFICIENT_BUFFER
    throw "Could not determine process package identity: $result"
}

function Invoke-UnpackagedInstallScript {
    param(
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string]$WorkDirectory,
        [string]$RecoveryMediaRoot
    )
    $taskName = 'MetalGearLauncher-LocalInstall-' + [guid]::NewGuid().ToString('N')
    $worker = Join-Path $WorkDirectory 'worker.ps1'
    $resultFile = Join-Path $WorkDirectory 'result.json'
    $helper = $PSCommandPath
    function Quote-Literal([string]$value) { return "'" + $value.Replace("'", "''") + "'" }
    $invoke = '& ' + (Quote-Literal $ScriptPath)
    if ($RecoveryMediaRoot) { $invoke += ' -RecoveryMediaRoot ' + (Quote-Literal $RecoveryMediaRoot) }
    $workerCode = @"
`$ErrorActionPreference = 'Stop'
try {
    . $(Quote-Literal $helper)
    if (Test-CurrentProcessPackaged) { throw 'Scheduled installer still has a package identity.' }
    `$output = @($invoke *>&1 | Out-String)
    `$result = @{ Ok = `$true; Output = `$output -join "`n" }
} catch {
    `$result = @{ Ok = `$false; Output = `$_ | Out-String }
}
`$result | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $(Quote-Literal ($resultFile + '.tmp')) -Encoding UTF8
[IO.File]::Move($(Quote-Literal ($resultFile + '.tmp')), $(Quote-Literal $resultFile))
"@
    Set-Content -LiteralPath $worker -Value $workerCode -Encoding utf8BOM
    $shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $action = New-ScheduledTaskAction -Execute $shell -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$worker`"" -WorkingDirectory $WorkDirectory
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    try {
        Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null
        Start-ScheduledTask -TaskName $taskName
        $deadline = (Get-Date).AddMinutes(15)
        while (-not (Test-Path -LiteralPath $resultFile)) {
            if ((Get-Date) -gt $deadline) { throw "Timed out waiting for local installation. Staged files remain in $WorkDirectory" }
            Start-Sleep -Seconds 2
        }
        $result = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
        if (-not $result.Ok) { throw $result.Output }
        Write-Output $result.Output
    } finally {
        if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        }
    }
}

# Merge only missing user files from the package's view into the ordinary user's view.
function Restore-MissingLauncherMedia {
    param([Parameter(Mandatory)][string]$SourceRoot, [Parameter(Mandatory)][string]$DestinationRoot)
    $source = [IO.Path]::GetFullPath($SourceRoot)
    $destination = [IO.Path]::GetFullPath($DestinationRoot)
    $files = @()
    foreach ($name in @('music', 'sounds')) {
        $from = Join-Path $source $name
        if (-not (Test-Path -LiteralPath $from)) { continue }
        $pending = [Collections.Generic.Queue[string]]::new()
        $pending.Enqueue($from)
        while ($pending.Count) {
            $entry = Get-Item -LiteralPath $pending.Dequeue() -Force
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing redirected staged media: $($entry.FullName)" }
            $relative = $entry.FullName.Substring($source.TrimEnd('\').Length + 1)
            $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
            if (-not $target.StartsWith($destination.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe media recovery destination.' }
            $check = $target
            while ($check -and $check.Length -ge $destination.Length) {
                if ((Test-Path -LiteralPath $check) -and ((Get-Item -LiteralPath $check -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing redirected media destination: $check" }
                $check = [IO.Path]::GetDirectoryName($check)
            }
            if ($entry.PSIsContainer) {
                foreach ($child in Get-ChildItem -LiteralPath $entry.FullName -Force) { $pending.Enqueue($child.FullName) }
            } else {
                $files += @{ From = $entry.FullName; To = $target }
            }
        }
    }
    foreach ($file in $files) {
        if (Test-Path -LiteralPath $file.To) { continue }
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($file.To)) -Force | Out-Null
        [IO.File]::Copy($file.From, $file.To, $false)
    }
}
