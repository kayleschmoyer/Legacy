# Diagnostic Scripts

Ready-to-run PowerShell scripts that auto-classify CI failure types.

## Common Troubleshooting Workflow

```powershell
# Step 1: Identify the failed run
$runId = (gh run list --branch $(git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')

# Step 2: Find the failed task(s)
gh run view $runId --log-failed | Select-String "Failed tasks:"

# Step 3: Find the ROOT CAUSE - Get context BEFORE the failure
gh run view $runId --log-failed | Select-String -Context 20,5 "❌ > nx run"

# Step 4: Look for warnings that caused the failure
gh run view $runId --log-failed | Select-String "Warning:|Failed to load|Cannot find"

# Step 5: Extract the EXACT error (file, line, message)
# Pick the right command based on what step 2 found:
gh run view $runId --log-failed | Select-String "\d+:\d+\s+error" -Context 1        # lint
gh run view $runId --log-failed | Select-String "\.ts\(\d+,\d+\): error" -Context 1  # typecheck
gh run view $runId --log-failed | Select-String "Expected:|Received:" -Context 3      # test
gh run view $runId --log-failed | Select-String "Module not found|Cannot find" -Context 3  # build

# Step 6: If nothing matched, use the annotation format
gh run view $runId --log | Select-String "##\[error\]" -Context 5

# Step 7: Classify the failure type
$errorTypes = @(
  "Failed to load",     # Module loading errors (ROOT CAUSE)
  "Cannot find module", # Missing dependencies (ROOT CAUSE)
  "\(node:\d+\) Warning", # Node.js warnings (ROOT CAUSE)
  "over.*months old",   # Outdated packages (ROOT CAUSE)
  "error TS",           # TypeScript errors
  "FAIL.*spec",         # Test failures (SYMPTOM)
  "React does not",     # React warnings
  "exit code",          # Process crashes
  "Failed tasks"        # Nx task failures
)

foreach ($pattern in $errorTypes) {
  $matches = gh run view $runId --log-failed | Select-String $pattern
  if ($matches) {
    Write-Host "Found: $pattern - Count: $($matches.Count)"
    # Print the first 3 matches so you can see the actual errors
    $matches | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" }
  }
}

# ⚠️ DO NOT attempt a fix until you can state the exact error.
# If all searches return nothing, save to file and read manually:
# gh run view $runId --log > ci-full.txt ; code ci-full.txt
```

## Comprehensive One-Liner Diagnostics

```powershell
# === Quick: classify all failure types ===
$runId = (gh run list --branch (git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')
$logs = gh run view $runId --log-failed

@{
  "🔧 Setup"        = "Nx CLI not available|node_modules.*not found|workspace.*invalid"
  "📦 Modules"      = "Failed to load|Cannot find module|\(node:\d+\) Warning"
  "🎨 Format"       = "format:check.*failed|Formatting.*failed|formatting issues"
  "🔍 Lint"         = "error  .*@typescript-eslint|✖ \d+ problems|ESLint.*failed"
  "📝 TypeScript"   = "error TS\d+"
  "🧪 Tests"        = "FAIL.*spec\.ts|Test Suites:.*failed"
  "🏗️ Build"         = "Running target.*failed|Failed tasks:|build failed"
  "🌐 E2E"          = "server.*fail|server.*died|playwright.*error"
  "📚 Skills"       = "skill.*failed validation"
  "🔒 Terraform"    = "state lock|Lock Info|terraform.*failed"
  "⏹️ Cancelled"     = "operation was canceled|more recent commit"
  "🔐 Permissions"  = "not accessible by integration|403"
}.GetEnumerator() | ForEach-Object {
  $hits = $logs | Select-String $_.Value
  if ($hits) { Write-Host "$($_.Key) — $($hits.Count) hit(s)" -ForegroundColor Red }
}
```
