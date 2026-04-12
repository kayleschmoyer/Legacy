# Force Clean Node Modules - Windows File Lock Handler
param([switch]$Verbose)

$ErrorActionPreference = "Continue"
$workspaceRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Force Cleaning Node Modules ===" -ForegroundColor Cyan
Write-Host "Workspace: $workspaceRoot" -ForegroundColor Cyan

# Step 1: Kill workspace-specific Node processes only
Write-Host "`nStep 1: Stopping workspace Node.js processes..." -ForegroundColor Cyan
$workspaceEscaped = [regex]::Escape($workspaceRoot)
$currentPid = $PID
$currentProc = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
$parentPid = if ($currentProc) { $currentProc.ParentProcessId } else { $null }

$workspaceProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
    $_.Name -match "^(node|esbuild)\.exe$" -and 
    $_.CommandLine -and 
    $_.CommandLine -match $workspaceEscaped -and 
    $_.ProcessId -ne $currentPid -and 
    $_.ProcessId -ne $parentPid 
}

if ($workspaceProcs) {
    $workspaceProcs | ForEach-Object { 
        Write-Host "   Stopping $($_.Name) (PID: $($_.ProcessId))" -ForegroundColor Yellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   Stopped $($workspaceProcs.Count) workspace process(es)" -ForegroundColor Green
} else {
    Write-Host "   No workspace Node.js/esbuild processes running" -ForegroundColor Green
}

# Step 1b: Kill node processes holding native addon (.node) file locks
# These processes may not have the workspace path in their CommandLine but still
# lock native binaries (e.g. bufferutil.node, utf-8-validate.node) inside node_modules.
# Also scan node_modules_DELETE_ME_* folders — processes that loaded addons before a
# rename still hold file handles under the original path.
Write-Host "`nStep 1b: Releasing native addon file locks..." -ForegroundColor Cyan
$addonPatterns = @([regex]::Escape((Join-Path $workspaceRoot 'node_modules')))
Get-ChildItem -Path $workspaceRoot -Directory -Filter 'node_modules_DELETE_ME_*' -ErrorAction SilentlyContinue |
    ForEach-Object { $addonPatterns += [regex]::Escape($_.FullName) }
$addonRegex = '(' + ($addonPatterns -join '|') + ').*\.node$'
$addonProcs = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    try { ($_.Modules | Where-Object { $_.FileName -match $addonRegex }).Count -gt 0 } catch { $false }
}
if ($addonProcs) {
    $addonProcs | ForEach-Object {
        Write-Host "   Stopping $($_.ProcessName) (PID $($_.Id)) - holds native addon lock" -ForegroundColor Yellow
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   Stopped $($addonProcs.Count) process(es) holding native addon locks" -ForegroundColor Green
} else {
    Write-Host "   No processes holding native addon locks" -ForegroundColor Green
}

# Step 2: Stop Nx daemon
Write-Host "`nStep 2: Stopping Nx daemon..." -ForegroundColor Cyan
try {
    Set-Location $workspaceRoot
    $job = Start-Job { Set-Location $using:workspaceRoot; npx nx daemon --stop }
    Wait-Job $job -Timeout 5 | Out-Null
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue
    Write-Host "   Nx daemon stopped" -ForegroundColor Green
} catch {
    Write-Host "   Nx daemon not running" -ForegroundColor Green
}

# Step 3: Wait for file handles
Write-Host "`nStep 3: Waiting for file handles to release..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Write-Host "   File handles released" -ForegroundColor Green

# Step 4: Remove node_modules
Write-Host "`nStep 4: Removing node_modules..." -ForegroundColor Cyan
$nodeModulesPath = Join-Path $workspaceRoot "node_modules"

if (Test-Path $nodeModulesPath) {
    # Check if node_modules is a symlink (shared with worktrees) -- only unlink, don't destroy target
    $nmItem = Get-Item $nodeModulesPath -Force
    if (($nmItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        cmd /c "rmdir `"$nodeModulesPath`"" 2>$null
        Write-Host "   node_modules symlink removed (target preserved)" -ForegroundColor Green
    }
    else {
        try {
            Remove-Item -Path $nodeModulesPath -Recurse -Force -ErrorAction Stop
            Write-Host "   node_modules removed successfully" -ForegroundColor Green
        } catch {
            Write-Host "  Standard removal failed, using robocopy..." -ForegroundColor Yellow
            $emptyDir = Join-Path $env:TEMP "empty_$(Get-Random)"
            New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
            robocopy $emptyDir $nodeModulesPath /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
            Remove-Item -Path $emptyDir -Force -ErrorAction SilentlyContinue
            try {
                Remove-Item -Path $nodeModulesPath -Recurse -Force -ErrorAction Stop
                Write-Host "   node_modules removed using robocopy" -ForegroundColor Green
            } catch {
                $deleteMePath = Join-Path $workspaceRoot "node_modules_DELETE_ME_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
                Rename-Item -Path $nodeModulesPath -NewName (Split-Path $deleteMePath -Leaf) -Force
                Write-Host "   Renamed to: $(Split-Path $deleteMePath -Leaf)" -ForegroundColor Yellow
                Write-Host "  Please manually delete this folder" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "   node_modules already removed" -ForegroundColor Green
}

# Step 5: Remove .nx cache
Write-Host "`nStep 5: Removing Nx cache..." -ForegroundColor Cyan
$nxCachePath = Join-Path $workspaceRoot ".nx"
if (Test-Path $nxCachePath) {
    try {
        Remove-Item -Path $nxCachePath -Recurse -Force -ErrorAction Stop
        Write-Host "   .nx cache removed" -ForegroundColor Green
    } catch {
        Write-Host "   Could not remove .nx cache" -ForegroundColor Yellow
    }
} else {
    Write-Host "   .nx cache already removed" -ForegroundColor Green
}

# Step 6: Clean up any leftover node_modules_DELETE_ME_* folders from previous runs
$leftovers = Get-ChildItem -Path $workspaceRoot -Directory -Filter "node_modules_DELETE_ME_*" -ErrorAction SilentlyContinue
if ($leftovers) {
    Write-Host "`nStep 6: Cleaning up leftover node_modules_DELETE_ME_* folders..." -ForegroundColor Cyan
    foreach ($leftover in $leftovers) {
        try {
            Remove-Item -Path $leftover.FullName -Recurse -Force -ErrorAction Stop
            Write-Host "   Removed $($leftover.Name)" -ForegroundColor Green
        } catch {
            Write-Host "   Could not remove $($leftover.Name) (still locked — retry after reboot)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n=== Clean Complete ===" -ForegroundColor Green
Write-Host "You can now run 'pnpm install' to reinstall dependencies" -ForegroundColor Cyan
