# preToolUse hook: block edit/create operations targeting the main repo
# when worktrees exist. Forces agents to use the worktree path.
#
# Input JSON:  { toolName, toolArgs (stringified JSON with .path) }
# Deny output: { "permissionDecision": "deny", "permissionDecisionReason": "..." }
# No output = allow. Fails open on parse errors.
#
# Claude equivalent: .claude/hooks/guard-main-repo.sh

param()

$inputJson = [Console]::In.ReadToEnd()

if (-not $inputJson) { exit 0 }

try {
    $parsed = $inputJson | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0  # Fail open
}

$toolName = $parsed.toolName

# Only guard file-writing tools
if ($toolName -notin @('edit', 'create', 'write')) {
    exit 0
}

# toolArgs is a stringified JSON — parse it to extract the file path
$toolArgsStr = $parsed.toolArgs
if (-not $toolArgsStr) { exit 0 }

try {
    $toolArgs = $toolArgsStr | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0  # Fail open
}

$filePath = if ($toolArgs.path) { $toolArgs.path } elseif ($toolArgs.file_path) { $toolArgs.file_path } else { $null }
if (-not $filePath) { exit 0 }

# Normalise to forward slashes for comparison
$filePath = $filePath -replace '\\', '/'

$mainRepo = 'D:/code/legacy-sports'

# Allow if not in main repo
if (-not $filePath.StartsWith("$mainRepo/")) {
    exit 0
}

# Allow edits to .github/ (Copilot config, hooks, instructions)
if ($filePath.StartsWith("$mainRepo/.github/")) {
    exit 0
}

# Allow edits to MCP server source files (development tooling)
if ($filePath.StartsWith("$mainRepo/tools/mcp/")) {
    exit 0
}

# Allow edits to workspace file
if ($filePath -like '*legacy-sports.code-workspace') {
    exit 0
}

# Check if any worktrees exist
$worktreeOutput = git -C $mainRepo.Replace('/', '\') worktree list --porcelain 2>$null
$worktreeCount  = ($worktreeOutput | Select-String '^worktree ').Count - 1  # Subtract main repo entry

if ($worktreeCount -le 0) {
    exit 0  # No worktrees — allow main repo edits
}

# Deny
$reason = "Editing files in the main repo ($mainRepo) is blocked while $worktreeCount worktree(s) exist. Edit the file in the worktree path instead (D:/code/legacy-sports.worktrees/...)."
@{ permissionDecision = 'deny'; permissionDecisionReason = $reason } | ConvertTo-Json -Compress

exit 0
