# CI Pipeline Architecture & Diagnostic Scripts

## Pipeline Architecture Reference

Understanding the CI architecture helps with debugging. The pipeline uses a two-layer design:

```
ci-orchestrator.yml  (triggered by PR / push / merge_group / schedule)
├── determine-scope        ← decides which sub-workflows to run
├── ci-pipeline.yml        ← main quality + build pipeline (reusable workflow)
│   ├── detect-changes     ← dorny/paths-filter + git diff
│   ├── quality-gates      ← format → lint → typecheck → test
│   ├── build-validation   ← web / mobile / lambda builds
│   ├── e2e                ← Playwright tests
│   └── summarize          ← PR comment + badges
└── security-scanning.yml  ← conditional
```

**Key environment variables in CI:**

| Variable             | Value                       | Purpose                      |
| -------------------- | --------------------------- | ---------------------------- |
| `NX_DAEMON`          | `false`                     | Disables persisted Nx daemon |
| `NX_SKIP_NX_CACHE`   | `false`                     | Cache enabled                |
| `NX_CACHE_DIRECTORY` | `.nx-cache`                 | Local cache path             |
| `NODE_OPTIONS`       | `--max_old_space_size=4096` | 4GB heap limit               |
| `NX_NO_CLOUD`        | `true`                      | Disables Nx Cloud            |
| `NX_VERBOSE_LOGGING` | `true` (debug mode)         | Extra logging                |

**Timeouts per job:**

| Job              | Timeout |
| ---------------- | ------- |
| detect-changes   | 5 min   |
| quality-gates    | 30 min  |
| build-validation | 30 min  |
| e2e              | 30 min  |
| summarize        | 10 min  |

## Deployment Pipeline Debugging

Deployment failures don't show in normal CI checks but block production releases. Three deployment pipelines exist:

### Web deployment (`deploy-web.yml`)

Triggers on push to `main` (paths: `apps/web/**`, `lib/shared-components/**`). Deploys to GitHub Pages.

```powershell
# Find deploy runs
gh run list --workflow deploy-web.yml --limit 5

# Check for failures
gh run view RUN_ID --log-failed | Select-String "build failed|deploy.*failed|Pages.*error" -Context 5
```

Common issues: missing `VITE_*` secrets, Sentry sourcemap upload failure, Pages deployment timeout.

### Lambda deployment (`upload-lambdas.yml` → `lambda-terraform-apply.yml`)

The consolidated upload workflow builds affected lambdas via matrix, packages and uploads to S3. Then `lambda-terraform-apply.yml` runs Terraform to update the Lambda function code.

```powershell
# Find upload runs
gh run list --workflow upload-lambdas.yml --limit 5

# Find terraform apply runs
gh run list --workflow lambda-terraform-apply.yml --limit 5
```

**Batching behavior:** If multiple lambdas push simultaneously, the Terraform apply job uses `cancel-in-progress: true` to batch — the first Terraform run gets cancelled and the second picks up all changes. This is expected, not a failure.

## Comprehensive Diagnostic Script

Enhanced version of the quick diagnostic — classifies all failure types:

```powershell
$runId = (gh run list --branch (git branch --show-current) --limit 1 --json databaseId --jq '.[0].databaseId')
$logs = gh run view $runId --log-failed

$categories = @{
  "🔧 Setup/Workspace"     = "Nx CLI not available|node_modules.*not found|workspace.*invalid|pnpm-lock.*not found"
  "📦 Module Loading"       = "Failed to load|Cannot find module|\(node:\d+\) Warning"
  "🎨 Formatting"           = "format:check.*failed|Formatting.*failed|formatting issues detected"
  "🔍 Lint"                 = "error  .*@typescript-eslint|✖ \d+ problems|ESLint.*failed"
  "📝 TypeScript"           = "error TS\d+"
  "🧪 Unit Tests"           = "FAIL.*spec\.ts|Test Suites:.*failed"
  "🏗️ Build"                = "Running target.*failed|Failed tasks:|build failed"
  "🌐 E2E"                  = "server.*fail|server.*died|playwright.*error"
  "📚 Skills Lint"          = "skill.*failed validation|✖.*skill"
  "🔒 Terraform Lock"       = "state lock|Lock Info"
  "⏹️ Cancelled"            = "operation was canceled|more recent commit"
  "🔐 Permissions"          = "not accessible by integration|403|Permission denied"
}

foreach ($name in $categories.Keys) {
  $hits = $logs | Select-String $categories[$name]
  if ($hits) {
    Write-Host "$name — $($hits.Count) hit(s)" -ForegroundColor Red
    $hits | Select-Object -First 2 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
  }
}
```
