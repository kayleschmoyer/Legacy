# PreToolUse hook: warn when Bash commands have direct MCP tool replacements.
# Always exits 0 — this is a WARNING hook, not a blocker.
#
# Receives JSON on stdin with tool_name and tool_input.command.
# Warning is written to stdout so the agent sees it before the tool executes.
# Add `# mcp-ok` to suppress the warning for verified cases.
#
# Claude Code equivalent: .claude/hooks/guard-bash-mcp-first.sh

$inputJson = [Console]::In.ReadToEnd()
if (-not $inputJson) { exit 0 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    exit 0  # Fail open
}

if ($data.tool_name -ne 'Bash') { exit 0 }

$command = $data.tool_input.command
if (-not $command) { exit 0 }

# Strip leading whitespace and extract the first token
$trimmed = $command.TrimStart()
$firstWord = ($trimmed -split '[\s;|&<>]')[0]

# Normalize to basename (handles /usr/bin/rg etc.)
if ($firstWord -and $firstWord -ne '-') {
    $firstWord = Split-Path $firstWord -Leaf
}

$replacement = $null
$bad = $firstWord

switch ($firstWord) {
    'ls'   { $replacement = 'Glob (e.g. Glob({ pattern: "**/*.ts", path: "<dir>" })). If Glob returns empty on a Windows worktree absolute path, fall back to worktree_ls_tree({ ref: "HEAD", path: "apps/web" }) — note: path must be repo-relative, not absolute — or worktree_run({ command: "dir <dir>" }) for all files including untracked' }
    'find' { $replacement = 'Glob for file discovery (Glob({ pattern: "**/*.ts" })) or Grep for content search (Grep({ pattern: "foo", glob: "**/*.ts" })). If Glob returns empty on a Windows worktree absolute path, fall back to worktree_ls_tree({ ref: "HEAD", path: "<repo-relative-dir>" }) or worktree_run({ command: "dir <dir>" }). For find ... -exec with no MCP equivalent, add `# mcp-ok` (see below)' }
    'grep' { $replacement = 'Grep (Grep({ pattern: "foo", path: "<dir>", glob: "**/*.ts", output_mode: "content" }))' }
    'rg'   { $replacement = 'Grep (Grep({ pattern: "foo", path: "<dir>", glob: "**/*.ts", output_mode: "content" }))'; $bad = $firstWord }
    'head' { $replacement = 'Read with limit (Read({ file_path: "...", limit: N }))' }
    'tail' { $replacement = 'Read with offset (first Read to get total_lines, then Read({ file_path: "...", offset: total - N, limit: N }))' }
    'cat'  {
        # Allow heredocs, pipelines, stdin passthrough, output redirects
        $rest = ($trimmed -replace '^cat\s*', '')
        if ($trimmed -match '<<') { exit 0 }
        if ($trimmed -match '(?<!\|)\|(?!\|)') { exit 0 }  # true pipeline
        if (-not $rest) { exit 0 }  # stdin passthrough
        if ($rest -match '>>|[^<]>|^>') { exit 0 }  # output redirect
        $replacement = 'Read (Read({ file_path: "<absolute path>" }))'
    }
    default { exit 0 }
}

# Check for bypass marker — suppresses warning when agent has verified no MCP alternative.
$bypassed = $command -match '(^|[\s])#\s*mcp-ok'

# Append to audit log (best-effort). Supplements ci_audit_session_bash.
$auditLog = '.claude/bash-audit.log'
$auditStatus = if ($bypassed) { 'BYPASS' } else { 'WARN' }
$oneLine = ($trimmed -replace '[\r\n\t]+', ' ') -replace '  +', ' '
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
try { Add-Content -Path $auditLog -Value "$timestamp $auditStatus $oneLine" -ErrorAction SilentlyContinue } catch {}

# If agent acknowledged with # mcp-ok, allow silently.
if ($bypassed) { exit 0 }

Write-Output @"
[MCP-FIRST WARNING] ``$bad`` has MCP-first alternatives — check for an MCP tool before using Bash.

  Preferred: $replacement

  Command running: $trimmed

  If you have already verified that no MCP tool covers this case, add ``# mcp-ok`` to suppress this warning:
    $trimmed  # mcp-ok: <brief reason>
"@

exit 0
