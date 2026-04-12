# PreToolUse hook: block Edit/Write operations targeting the main repo
# when worktrees exist. Forces agents to use the worktree path.
#
# Receives JSON on stdin with tool_name and tool_input.file_path.
# Exit 0 = allow, exit 2 = block (Claude Code format).
# Fails open: if input is invalid or PowerShell errors, allows the operation.
#
# Claude Code equivalent: .claude/hooks/guard-main-repo.sh

$inputJson = [Console]::In.ReadToEnd()
if (-not $inputJson) { exit 0 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    exit 0  # Fail open on parse errors
}

$filePath = $data.tool_input.file_path
if (-not $filePath) { exit 0 }

# Normalize slashes for comparison
$filePath = $filePath -replace '/', '\'

$mainRepo = 'D:\code\legacy-sports'
if (-not $filePath.StartsWith($mainRepo + '\') -and $filePath -ne $mainRepo) { exit 0 }

# Allow .claude/ config and hook files
if ($filePath.StartsWith("$mainRepo\.claude\")) { exit 0 }

# Allow workspace file
if ($filePath -match 'legacy-sports\.code-workspace$') { exit 0 }

# Allow MCP server source files (development tooling)
if ($filePath.StartsWith("$mainRepo\tools\mcp\")) { exit 0 }

# Check if any worktrees exist
try {
    $wtLines = git -C $mainRepo worktree list --porcelain 2>$null | Select-String '^worktree'
    $worktreeCount = $wtLines.Count - 1  # Subtract 1 for the main repo entry
} catch {
    exit 0  # Fail open
}

if ($worktreeCount -le 0) { exit 0 }

# Block: file is in main repo and worktrees exist
Write-Error "BLOCKED: Editing files in the main repo ($mainRepo) while $worktreeCount worktree(s) exist. Edit the file in the worktree path instead (D:\code\legacy-sports.worktrees\...)."
exit 2
