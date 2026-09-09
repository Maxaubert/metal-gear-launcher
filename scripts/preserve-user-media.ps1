# Preserve user-provided media separately from disposable launcher state.
function Copy-LauncherUserMedia {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$SourceRoot,
        [Parameter(Mandatory)][string]$DestinationRoot
    )
    $source = [IO.Path]::GetFullPath($SourceRoot)
    $destination = [IO.Path]::GetFullPath($DestinationRoot)
    if (-not (Test-Path -LiteralPath $source)) { return }
    $mediaFolders = @()
    foreach ($name in @('music', 'sounds')) {
        $from = Join-Path $source $name
        $to = Join-Path $destination $name
        if (-not (Test-Path -LiteralPath $from)) { continue }
        if (Test-Path -LiteralPath $to) { throw "Refusing to overwrite existing imported media: $to" }
        $pending = [Collections.Generic.Queue[string]]::new()
        $pending.Enqueue($from)
        while ($pending.Count) {
            $entry = Get-Item -LiteralPath $pending.Dequeue() -Force -ErrorAction Stop
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing redirected imported media: $($entry.FullName)" }
            if ($entry.PSIsContainer) {
                foreach ($child in Get-ChildItem -LiteralPath $entry.FullName -Force -ErrorAction Stop) { $pending.Enqueue($child.FullName) }
            }
        }
        $mediaFolders += @{ From = $from; To = $to }
    }
    if ($mediaFolders.Count) {
        New-Item -ItemType Directory -Path $destination -Force -ErrorAction Stop | Out-Null
        foreach ($folder in $mediaFolders) { Copy-Item -LiteralPath $folder.From -Destination $folder.To -Recurse -Force -ErrorAction Stop }
    }
}
