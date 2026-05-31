# SessionStart hook: create node_modules symlink in ephemeral worktrees.
# Handles both Claude Code (.claude/worktrees/<name>) and Copilot (<repo>.worktrees/<name>) patterns.
#
# Delegates to scripts/modules-pool/link.mjs — same resolver as the bash hook.
# The PS hook may run concurrently with the bash hook; the resolver is idempotent
# and uses atomic-rename publish, so concurrent callers converge on one pool slot.
#
# Claude Code equivalent: .claude/hooks/setup-worktree-symlink.sh

$worktree = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { $PWD.Path }

# --- 0. Defensive input validation --------------------------------------------
# $worktree arrives from CLAUDE_PROJECT_DIR or $PWD. Even though the PowerShell
# call operator (& cmd arg1 arg2) passes argv directly without shell evaluation,
# reject malformed values up front so a stray env var produces a silent no-op
# instead of a confusing partial run.
#
# 1. Must be a non-empty rooted path (System.IO.Path treats e.g. C:\, D:\, /usr
#    as rooted; relative paths are rejected).
# 2. Must NOT contain characters that are illegal in Windows paths (these
#    cannot reach a shell interpreter from here, but rejecting them keeps the
#    contract simple and surface area minimal).
# 3. Must exist as a directory on disk.
if ([string]::IsNullOrWhiteSpace($worktree)) { exit 0 }
if (-not [System.IO.Path]::IsPathRooted($worktree)) { exit 0 }
$invalidChars = [System.IO.Path]::GetInvalidPathChars()
foreach ($ch in $invalidChars) {
    if ($worktree.Contains($ch)) { exit 0 }
}
if (-not (Test-Path -LiteralPath $worktree -PathType Container)) { exit 0 }
# Canonicalize so downstream uses see a consistent absolute path.
$worktree = (Resolve-Path -LiteralPath $worktree).Path

# --- 1. Detect worktree pattern -----------------------------------------------
$parentDir  = Split-Path $worktree -Parent
$parentName = Split-Path $parentDir -Leaf

$isWorktree = $false

# Pattern A: Copilot — <root>\<repo>.worktrees\<name>
if ($parentName -like '*.worktrees') {
    $isWorktree = $true
}
# Pattern B: Claude Code — <root>\<repo>\.claude\worktrees\<name>
elseif ($worktree -match [regex]::Escape('\.claude\worktrees\') + '[^\\]+$') {
    $isWorktree = $true
}

if (-not $isWorktree) { exit 0 }

# --- 2. Delegate to the Node.js pool resolver ----------------------------------
# node is available system-wide; the resolver is dependency-free (no node_modules needed).
# Capture stderr to a log file rather than discarding it — the hook must never
# block session startup, but we still want the root cause visible when node
# fails (missing node, script bug, mklink permission denied, etc.).
$tempDir = if ($env:TEMP) { $env:TEMP } elseif ($env:TMP) { $env:TMP } else { '/tmp' }
$setupLog = Join-Path $tempDir 'claude-setup-worktree-symlink.log'
"--- $((Get-Date).ToUniversalTime().ToString('o')) worktree=$worktree ---" | Out-File -FilePath $setupLog -Append -Encoding utf8
& node "$worktree\scripts\modules-pool\link.mjs" "--worktree=$worktree" *>> $setupLog
# Cap log at 500 lines so it doesn't grow unbounded over many sessions.
if (Test-Path $setupLog) {
    $tail = Get-Content -LiteralPath $setupLog -Tail 500 -ErrorAction SilentlyContinue
    if ($tail) { $tail | Set-Content -LiteralPath $setupLog -Encoding utf8 }
}

exit 0
