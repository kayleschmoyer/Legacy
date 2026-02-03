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
Write-Host "`nStep 4: Waiting for file handles to release..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Write-Host "   File handles released" -ForegroundColor Green

# Step 4: Remove node_modules
Write-Host "`nStep 5: Removing node_modules..." -ForegroundColor Cyan
$nodeModulesPath = Join-Path $workspaceRoot "node_modules"

if (Test-Path $nodeModulesPath) {
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
} else {
    Write-Host "   node_modules already removed" -ForegroundColor Green
}

# Step 5: Remove .nx cache
Write-Host "`nStep 6: Removing Nx cache..." -ForegroundColor Cyan
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

Write-Host "`n=== Clean Complete ===" -ForegroundColor Green
Write-Host "You can now run 'pnpm install' to reinstall dependencies" -ForegroundColor Cyan
