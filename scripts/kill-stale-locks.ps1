# kill-stale-locks.ps1 -- Find and kill node processes holding native addon locks
#
# Scans node_modules and any node_modules_DELETE_ME_* leftover folders for
# .node native addons loaded by running node processes. Kills those processes
# (unless -DryRun) and then cleans up DELETE_ME folders.
#
# Usage:
#   .\scripts\kill-stale-locks.ps1 -WorkspaceRoot "D:\code\legacy-sports"
#   .\scripts\kill-stale-locks.ps1 -WorkspaceRoot "D:\code\legacy-sports" -DryRun

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$WorkspaceRoot,

    [Parameter()]
    [switch]$DryRun
)

Set-StrictMode -Version Latest

# Ensure we're running as 64-bit process (required to enumerate 64-bit node process modules)
if (-not [Environment]::Is64BitProcess -and [Environment]::Is64BitOperatingSystem) {
    $ps64 = Join-Path $env:SystemRoot 'SysNative\WindowsPowerShell\v1.0\powershell.exe'
    if (Test-Path $ps64) {
        $args64 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-WorkspaceRoot', $WorkspaceRoot)
        if ($DryRun) { $args64 += '-DryRun' }
        & $ps64 @args64
        exit $LASTEXITCODE
    }
}

# Build regex matching .node files under node_modules and any DELETE_ME leftovers
if (-not (Test-Path $WorkspaceRoot)) {
    Write-Host "ERROR: WorkspaceRoot does not exist: $WorkspaceRoot" -ForegroundColor Red
    exit 1
}
$WorkspaceRoot = (Resolve-Path $WorkspaceRoot).Path

$patterns = @([regex]::Escape((Join-Path $WorkspaceRoot 'node_modules')))
Get-ChildItem -Path $WorkspaceRoot -Directory -Filter 'node_modules_DELETE_ME_*' -ErrorAction SilentlyContinue |
    ForEach-Object { $patterns += [regex]::Escape($_.FullName) }
$regex = '(' + ($patterns -join '|') + ').*\.node$'

# Find node processes with loaded native addons matching our paths
# Use Continue for module enumeration - some processes deny access to their module list
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$staleProcs = @()
foreach ($proc in (Get-Process node -ErrorAction SilentlyContinue)) {
    try {
        $mods = @($proc.Modules | Where-Object { $_.FileName -match $regex })
        if ($mods.Count -gt 0) { $staleProcs += $proc }
    } catch {
        # Access denied enumerating modules for this process - skip it
    }
}
$ErrorActionPreference = $prevEAP

if (-not $staleProcs) {
    Write-Host "No processes holding native addon locks" -ForegroundColor Green
} else {
    $staleProcs | ForEach-Object {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        Write-Host "  PID $($_.Id): $cmd" -ForegroundColor Yellow
    }

    if ($DryRun) {
        Write-Host "Dry run -- re-run this script without -DryRun to kill these processes" -ForegroundColor Cyan
    } else {
        $staleProcs | ForEach-Object {
            Write-Host "Stopping node (PID $($_.Id))" -ForegroundColor Red
            Stop-Process -Id $_.Id -Force
        }
        Start-Sleep -Seconds 1
    }
}

$ErrorActionPreference = "Stop"
# Clean up DELETE_ME leftovers (whether or not we killed anything - they may now be unlocked)
$leftovers = Get-ChildItem -Path $WorkspaceRoot -Directory -Filter 'node_modules_DELETE_ME_*' -ErrorAction SilentlyContinue
foreach ($dir in $leftovers) {
    try {
        Remove-Item -Path $dir.FullName -Recurse -Force -ErrorAction Stop
        Write-Host "  Cleaned up $($dir.Name)" -ForegroundColor Green
    } catch {
        Write-Host "  Could not remove $($dir.Name) (still locked)" -ForegroundColor Yellow
    }
}
