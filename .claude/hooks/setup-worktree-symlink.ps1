# SessionStart hook: create node_modules symlink in ephemeral worktrees.
# Handles both Claude Code (.claude/worktrees/<name>) and Copilot (<repo>.worktrees/<name>) patterns.
#
# Why symlinks (not junctions):
#   Directory symlinks (mklink /D) are NOT followed by recursive-delete tools.
#   When a worktree directory is deleted, only the link is removed — the target
#   node_modules in the main repo stays intact. Requires Windows Developer Mode.
#
# Claude Code equivalent: .claude/hooks/setup-worktree-symlink.sh

$worktree = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { $PWD.Path }

# --- 1. Detect worktree pattern and derive main repo path ----------------------
$parentDir  = Split-Path $worktree -Parent
$parentName = Split-Path $parentDir -Leaf

$mainRepo = $null

# Pattern A: Copilot — <root>\<repo>.worktrees\<name>
if ($parentName -like '*.worktrees') {
    $rootDir      = Split-Path $parentDir -Parent
    $mainRepoName = $parentName -replace '\.worktrees$', ''
    $mainRepo     = Join-Path $rootDir $mainRepoName
}
# Pattern B: Claude Code — <root>\<repo>\.claude\worktrees\<name>
elseif ($worktree -match [regex]::Escape('\.claude\worktrees\') + '[^\\]+$') {
    $mainRepo = $worktree -replace ([regex]::Escape('\.claude\worktrees\') + '[^\\]+$'), ''
}
else {
    exit 0  # Not in a known worktree pattern
}

$mainNm = Join-Path $mainRepo 'node_modules'
if (-not (Test-Path $mainNm -PathType Container)) {
    exit 0  # Main repo node_modules missing — nothing to symlink
}

# --- 2. Check if symlink needs creation/repair --------------------------------
$nm  = Join-Path $worktree 'node_modules'
$bin = Join-Path $nm '.bin'

$needsRecreate = $false

if (-not (Test-Path $nm)) {
    $needsRecreate = $true
} else {
    $item = Get-Item $nm -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        $needsRecreate = $true
    } elseif ($item.LinkType -eq 'Junction') {
        # NTFS junctions are dangerous: `git worktree remove` follows them and
        # recursively deletes the target, destroying the main repo's node_modules.
        # Directory symlinks (mklink /D) are safe — recreate as symlink (LS-3084).
        $needsRecreate = $true
    } elseif ($item.LinkType -ne 'SymbolicLink' -and $null -eq $item.LinkType) {
        # Real directory (no link type) — leave it alone
        exit 0
    } elseif (-not (Test-Path $bin -PathType Container) -or
              -not (Get-ChildItem $bin -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        # .bin missing or empty — symlink is broken/stale
        $needsRecreate = $true
    }
}

if (-not $needsRecreate) { exit 0 }

# --- 3. Remove stale/broken entry (non-recursive, safe) -----------------------
if (Test-Path $nm) {
    cmd /c "rmdir `"$nm`"" 2>$null
}

# --- 4. Create directory symlink via cmd mklink /D ----------------------------
cmd /c "mklink /D `"$nm`" `"$mainNm`"" 2>$null | Out-Null

if (-not (Test-Path $nm -PathType Container)) {
    try {
        New-Item -ItemType SymbolicLink -Path $nm -Target $mainNm -ErrorAction Stop | Out-Null
    } catch {
        Write-Warning "[hook] Failed to create node_modules symlink. Enable Windows Developer Mode."
        Write-Warning "  Source: $nm"
        Write-Warning "  Target: $mainNm"
        exit 1
    }
}

exit 0
