# mklink-symlink.ps1 — Reliably create a Windows directory symlink.
#
# Why this exists:
#   The obvious `cmd //c "mklink /D ..."` invocation from bash/MSYS2 silently
#   fails because MSYS2 path translation mangles the mklink arguments. The
#   PowerShell `New-Item -ItemType SymbolicLink` alternative requires admin
#   elevation even with Developer Mode enabled.
#
#   Calling `cmd /c mklink /D` *from PowerShell* bypasses both problems:
#   PowerShell invokes cmd.exe natively (no MSYS2 mangling) and cmd.exe's
#   mklink honors the Developer Mode symlink privilege without elevation.
#
# Compatible with both Windows PowerShell 5.1 and PowerShell 7+.
#
# Usage (always invoke via powershell -File, not & operator):
#   powershell -File scripts/mklink-symlink.ps1 -Link <path> -Target <path>
#   powershell -File scripts/mklink-symlink.ps1 -Link <path> -Target <path> -Force
#   powershell -File scripts/mklink-symlink.ps1 -Link <path> -Target <path> -Check
#
# Flags:
#   -Force   Remove an existing junction or broken symlink before creating.
#   -Check   Report link type (SymbolicLink | Junction | Directory | Missing)
#            and exit without creating anything. Exit code 0 = symlink,
#            1 = junction, 2 = real dir, 3 = missing, 4 = error.
#
# Exit codes (create mode):
#   0 = symlink created (or already correct)
#   1 = creation failed
#
# IMPORTANT: This script uses `exit` for exit codes, so callers within
# PowerShell must invoke it via `powershell -File` (separate process),
# NOT via the `&` call operator (which would terminate the caller).
#
# Requires: Windows Developer Mode (Settings > System > For Developers)

param(
    [Parameter(Mandatory)][string]$Link,
    [Parameter(Mandatory)][string]$Target,
    [switch]$Force,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Get-LinkInfo {
    # Detect link type using Get-Item -LiteralPath -Force, which sees broken
    # symlinks and junctions even when the target is missing (unlike Test-Path
    # which returns $false for broken links).
    param([string]$Path)
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    } catch [System.Management.Automation.ItemNotFoundException] {
        return @{ Exists = $false; LinkType = 'Missing' }
    }
    if ($item.LinkType) {
        return @{ Exists = $true; LinkType = $item.LinkType; Target = ($item.Target | Select-Object -First 1) }
    }
    if ($item.PSIsContainer) {
        return @{ Exists = $true; LinkType = 'Directory' }
    }
    return @{ Exists = $true; LinkType = 'File' }
}

function Remove-LinkSafely {
    # Use cmd rmdir (non-recursive) to remove symlinks/junctions without
    # following them into the target directory. Verifies removal using
    # Get-Item -LiteralPath (not Test-Path, which misses broken links).
    param([string]$Path)
    cmd /c "rmdir `"$Path`"" 2>$null
    $still = $null
    try { $still = Get-Item -LiteralPath $Path -Force -ErrorAction Stop } catch {}
    if ($still) {
        Write-Error "Failed to remove existing link at $Path (may be locked by another process)"
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Check mode
# ---------------------------------------------------------------------------

if ($Check) {
    $info = Get-LinkInfo $Link
    switch ($info.LinkType) {
        'SymbolicLink' {
            Write-Host "SymbolicLink -> $($info.Target)"
            exit 0
        }
        'Junction' {
            Write-Host "Junction -> $($info.Target)"
            exit 1
        }
        'Directory' {
            Write-Host "Directory (real, not a link)"
            exit 2
        }
        'Missing' {
            Write-Host "Missing"
            exit 3
        }
        default {
            Write-Host "Unknown: $($info.LinkType)"
            exit 4
        }
    }
}

# ---------------------------------------------------------------------------
# Create mode
# ---------------------------------------------------------------------------

# Validate target exists
if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
    Write-Error "Target does not exist or is not a directory: $Target"
    exit 1
}

# Check existing link
$info = Get-LinkInfo $Link

if ($info.Exists) {
    if ($info.LinkType -eq 'SymbolicLink') {
        # Already a proper symlink — check if target matches
        $resolved = Resolve-Path -LiteralPath $Link -ErrorAction SilentlyContinue
        $currentTarget = if ($resolved) { $resolved.Path } else { $info.Target }
        $resolvedTarget = Resolve-Path -LiteralPath $Target -ErrorAction SilentlyContinue
        $expectedTarget = if ($resolvedTarget) { $resolvedTarget.Path } else { $Target }
        if ($currentTarget -eq $expectedTarget) {
            Write-Host "Already a correct symlink: $Link -> $Target"
            exit 0
        }
        # Wrong target — remove and recreate
        Write-Host "Symlink points to wrong target ($($info.Target)), recreating..."
        Remove-LinkSafely $Link
    }
    elseif ($info.LinkType -eq 'Junction') {
        if ($Force) {
            Write-Host "Converting junction to symlink: $Link"
            Remove-LinkSafely $Link
        } else {
            Write-Error "Existing NTFS junction at $Link. Use -Force to convert to a directory symlink."
            exit 1
        }
    }
    elseif ($info.LinkType -eq 'Directory') {
        Write-Error "Real directory exists at $Link. Remove it manually before creating a symlink."
        exit 1
    }
    else {
        Write-Error "Unexpected item at $Link (type: $($info.LinkType)). Remove it manually."
        exit 1
    }
}

# Create directory symlink via cmd.exe mklink /D.
# This is the ONE reliable method on Windows:
#   - cmd.exe's mklink /D honors Developer Mode symlink privilege without elevation
#   - Unlike `New-Item -ItemType SymbolicLink`, no admin required
#   - Unlike `cmd //c` from bash/MSYS2, no path mangling
cmd /c "mklink /D `"$Link`" `"$Target`"" 2>$null | Out-Null

# Verify creation and type
$result = Get-LinkInfo $Link

if (-not $result.Exists) {
    Write-Error @"
Failed to create directory symlink.
  Link:   $Link
  Target: $Target

Directory symlinks require Windows Developer Mode to be enabled.
Enable it: Settings > System > For Developers > Developer Mode
"@
    exit 1
}

if ($result.LinkType -ne 'SymbolicLink') {
    Write-Error "Created link is $($result.LinkType) instead of SymbolicLink. This should not happen."
    exit 1
}

Write-Host "Symlink created: $Link -> $Target"
exit 0
