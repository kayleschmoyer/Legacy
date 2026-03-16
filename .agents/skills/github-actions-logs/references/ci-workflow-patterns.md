# CI Workflow Patterns

Workflow architecture map, composite action error signatures, deployment pipeline patterns, and concurrency behaviors.

## Workflow Architecture Map

Understanding which workflow generates which logs is critical for targeted debugging.

```
ci-orchestrator.yml  ← entry point for PRs / pushes / merge_group
├── ci-pipeline.yml  ← reusable workflow (main CI)
│   ├── detect-changes        (Job: detect-changes)
│   ├── quality-gates         (Job: quality-gates)
│   ├── build-validation      (Job: build-validation)
│   ├── e2e                   (Job: e2e)
│   └── summarize             (Job: summarize)
└── security-scanning.yml     (conditional)

deploy-web.yml       ← triggered on push to main (web paths)
├── setup
├── build-and-deploy
└── create-release

upload-*.yml         ← triggered on push to main (lambda paths)
└── upload           ← build + package + S3 upload

lambda-terraform-apply.yml  ← triggered by upload workflow completion
└── deploy           ← terraform init → plan → apply

merge-queue.yml      ← triggered by CI orchestrator completion + label events
└── process-queue    ← validate + squash-merge PRs

merge-queue-management.yml  ← triggered by label/review events
└── manage           ← UX comments on PR
```

### Identifying Which Workflow Failed

```powershell
# Most recent failed run across all workflows
gh run list --status failure --limit 5

# Check which workflow the run belongs to
gh run view RUN_ID --json workflowName --jq '.workflowName'

# List jobs within the run
gh run view RUN_ID --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
```

## Composite Action Error Signatures

Each composite action in `.github/actions/` produces distinctive error patterns. Use these signatures to quickly locate the failing action.

### Setup Action (`.github/actions/setup`)

```powershell
# Dependency installation failures
gh run view RUN_ID --log-failed | Select-String "pnpm-lock.*not found|node_modules.*not found after installation" -Context 3

# Nx workspace detection failures (tries 5 methods)
gh run view RUN_ID --log-failed | Select-String "Nx CLI not available|Nx not accessible|nx binary.*not functional" -Context 5

# Cache corruption recovery
gh run view RUN_ID --log-failed | Select-String "workspace.*not accessible after cleanup|recovery attempt" -Context 5
```

### Detect Changes Action (`.github/actions/detect-changes`)

```powershell
# Base ref resolution failures (falls back through multiple strategies)
gh run view RUN_ID --log | Select-String "Warning.*BASE_REF.*not found|using empty tree as fallback" -Context 3

# Check what changes were detected
gh run view RUN_ID --log | Select-String "affected-components|requires-full-build" -Context 2
```

### Quality Gates Action (`.github/actions/quality-gates`)

```powershell
# Pre-flight check failures (before quality checks even start)
gh run view RUN_ID --log-failed | Select-String "Dependencies not installed|Nx not found|Not in Nx workspace" -Context 3

# Individual gate failures
gh run view RUN_ID --log-failed | Select-String "formatting issues detected|ESLint.*failed|typecheck.*failed" -Context 5

# Which projects failed which gate
gh run view RUN_ID --log | Select-String "failed-projects" -Context 2
```

### Build Validation Action (`.github/actions/build-validation`)

```powershell
# Per-component build failures
gh run view RUN_ID --log-failed | Select-String "Web.*build failed|Lambda.*build failed|Mobile.*failed" -Context 10

# Build output verification failures
gh run view RUN_ID --log-failed | Select-String "Build output directory not found|artifacts missing" -Context 3
```

### E2E Testing Action (`.github/actions/e2e-testing`)

```powershell
# Dev server lifecycle issues
gh run view RUN_ID --log-failed | Select-String "server.*died|server failed to start|server.*crashed" -Context 10

# Artifact download issues (continue-on-error means silent failures)
gh run view RUN_ID --log | Select-String "download-artifact|Unable to find.*artifact|Artifact not found" -Context 3

# Playwright browser issues
gh run view RUN_ID --log-failed | Select-String "browser installation failed|chromium.*error" -Context 5

# E2E result classification
gh run view RUN_ID --log | Select-String "result=server-failure|result=build-failure|result=failure" -Context 2
```

### Terraform / Lambda Deployment Actions

```powershell
# Terraform state lock conflicts
gh run view RUN_ID --log-failed | Select-String "state lock|Lock Info|force-unlock" -Context 10

# SSM parameter failures (version tracking)
gh run view RUN_ID --log-failed | Select-String "SSM.*parameter|ParameterNotFound" -Context 3

# S3 upload failures
gh run view RUN_ID --log-failed | Select-String "S3.*upload|S3.*error|PutObject" -Context 5

# Terraform plan/apply failures
gh run view RUN_ID --log-failed | Select-String "terraform.*failed|Error:.*terraform" -Context 10
```

## Deployment Pipeline Log Patterns

### Web Deployment (deploy-web.yml)

```powershell
# Find the deploy run
$runId = (gh run list --workflow deploy-web.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Build failures (Vite/Nx)
gh run view $runId --log-failed | Select-String "BUILD FAILED|Module not found|vite.*error" -Context 5

# Missing environment variables
gh run view $runId --log-failed | Select-String "VITE_.*undefined|VITE_.*missing" -Context 3

# Sentry sourcemap upload failures
gh run view $runId --log-failed | Select-String "sentry.*error|sourcemap.*failed" -Context 5

# GitHub Pages deployment failures
gh run view $runId --log-failed | Select-String "Pages.*error|deploy.*failed|CNAME" -Context 5
```

### Lambda Upload (upload-lambdas.yml)

```powershell
# Find lambda upload runs
$runId = (gh run list --workflow upload-lambdas.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Build failures
gh run view $runId --log-failed | Select-String "Lambda build failed|build failed" -Context 10

# Packaging failures (missing dist output)
gh run view $runId --log-failed | Select-String "artifacts missing|dist.*not found" -Context 5

# AWS credential issues
gh run view $runId --log-failed | Select-String "credentials|AssumeRole|AccessDenied" -Context 5

# S3 upload issues
gh run view $runId --log-failed | Select-String "S3.*error|upload.*failed" -Context 5
```

### Lambda Terraform Apply (lambda-terraform-apply.yml)

```powershell
# Find terraform runs (triggered by upload workflow completion)
$runId = (gh run list --workflow lambda-terraform-apply.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# Batching: check if this run was cancelled by a newer one (expected behavior)
gh run view $runId --json conclusion --jq '.conclusion'

# Secret validation failures
gh run view $runId --log-failed | Select-String "required secret.*not configured|missing.*secret" -Context 3

# State lock issues
gh run view $runId --log-failed | Select-String "state lock|DynamoDB|Lock Info" -Context 10

# Plan/apply errors
gh run view $runId --log-failed | Select-String "Error:.*terraform|terraform.*failed" -Context 10

# Deployment verification
gh run view $runId --log | Select-String "Lambda.*function|deployment.*verified|ListFunctions" -Context 3
```

## Concurrency and Cancellation Patterns

The CI system uses concurrency groups to manage parallel runs:

| Workflow               | Concurrency Key                   | Cancel In-Progress             |
| ---------------------- | --------------------------------- | ------------------------------ |
| ci-orchestrator        | `orchestrator-{PR# or ref}`       | **Yes** — new push cancels old |
| deploy-web             | `{workflow}-{ref}`                | **Yes**                        |
| lambda-terraform-apply | `terraform-lambda-infrastructure` | **Yes** — batches deployments  |
| merge-queue            | `merge-queue`                     | **No** — serialized processing |

### Identifying Cancellation vs Failure

```powershell
# Check if the run was cancelled (not failed)
gh run view RUN_ID --json conclusion --jq '.conclusion'
# "cancelled" = intentionally stopped by concurrency
# "failure" = actual error

# Find what cancelled it (look for a newer run on same ref)
gh run list --branch (git branch --show-current) --limit 5 --json databaseId,conclusion,createdAt --jq '.[] | "\(.databaseId) \(.conclusion) \(.createdAt)"'
```
