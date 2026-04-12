# sessionEnd hook: remove node_modules symlink from Copilot worktree when session ends.
# Belt-and-suspenders cleanup — the main protection is that directory symlinks
# (mklink /D) are NOT followed by recursive-delete tools, so even if this hook
# doesn't fire the target is safe.
#
# Claude equivalent: .claude/hooks/cleanup-worktree-symlink.sh

param()

# Read JSON input from stdin (may be empty for sessionEnd)
$inputJson = [Console]::In.ReadToEnd()
$worktree = $PWD.Path

try {
    $parsed = $inputJson | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($parsed -and $parsed.cwd) { $worktree = $parsed.cwd }
} catch {}

# --- Guard: only act inside *.worktrees\<name> directories -------------------
$parentDir  = Split-Path $worktree -Parent
$parentName = Split-Path $parentDir -Leaf

if ($parentName -notlike "*.worktrees") {
    exit 0
}

$nm      = Join-Path $worktree 'node_modules'
$marker  = Join-Path $worktree '.copilot-session'

if (-not (Test-Path $nm)) {
    Remove-Item $marker -Force -ErrorAction SilentlyContinue
    exit 0
}

# Non-recursive removal via cmd rmdir (removes symlinks, fails harmlessly on real dirs)
cmd /c "rmdir `"$nm`"" 2>$null

Remove-Item $marker -Force -ErrorAction SilentlyContinue

exit 0
