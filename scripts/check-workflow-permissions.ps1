# Check GitHub repository workflow permissions settings
# Related to: LS-87 - PRs merged via automated merge queue don't trigger integration builds

param(
    [string]$Owner = "bkrupa",
    [string]$Repo = "legacy-sports"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking workflow permissions for $Owner/$Repo..." -ForegroundColor Cyan
Write-Host ""

# Check if gh CLI is available
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue

if (-not $ghAvailable) {
    Write-Host "ERROR: GitHub CLI (gh) is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install gh CLI: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Check manually at repository settings" -ForegroundColor Yellow
    exit 1
}

try {
    # Get repository settings
    Write-Host "Fetching repository settings..." -ForegroundColor Yellow
    
    $repoInfo = gh api "/repos/$Owner/$Repo" --jq '{
        name: .name,
        private: .private,
        default_branch: .default_branch
    }' | ConvertFrom-Json
    
    Write-Host "Repository: $($repoInfo.name)" -ForegroundColor Green
    Write-Host "  - Private: $($repoInfo.private)" -ForegroundColor Gray
    Write-Host "  - Default branch: $($repoInfo.default_branch)" -ForegroundColor Gray
    Write-Host ""
    
    # Get Actions permissions
    Write-Host "Fetching Actions permissions..." -ForegroundColor Yellow
    
    $actionsPermissions = gh api "/repos/$Owner/$Repo/actions/permissions" --jq '{
        enabled: .enabled,
        allowed_actions: .allowed_actions
    }' | ConvertFrom-Json
    
    $actionsStatus = if ($actionsPermissions.enabled) { "Enabled" } else { "Disabled" }
    Write-Host "GitHub Actions: $actionsStatus" -ForegroundColor Green
    Write-Host "  - Allowed actions: $($actionsPermissions.allowed_actions)" -ForegroundColor Gray
    Write-Host ""
    
    # Get workflow permissions (critical setting)
    Write-Host "Fetching workflow permissions..." -ForegroundColor Yellow
    
    $workflowPermissions = gh api "/repos/$Owner/$Repo/actions/permissions/workflow" --jq '{
        default_workflow_permissions: .default_workflow_permissions,
        can_approve_pull_request_reviews: .can_approve_pull_request_reviews
    }' | ConvertFrom-Json
    
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  WORKFLOW PERMISSIONS ANALYSIS" -ForegroundColor Cyan
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    
    $permissionLevel = $workflowPermissions.default_workflow_permissions
    $canApprovePRs = $workflowPermissions.can_approve_pull_request_reviews
    
    Write-Host "Default Workflow Permissions: " -NoNewline
    if ($permissionLevel -eq "write") {
        Write-Host "READ AND WRITE" -ForegroundColor Green
    } else {
        Write-Host "READ ONLY" -ForegroundColor Yellow
    }
    
    Write-Host "Can Approve/Create PRs: " -NoNewline
    if ($canApprovePRs) {
        Write-Host "YES" -ForegroundColor Green
    } else {
        Write-Host "NO" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    
    # Analyze the issue
    $hasIssue = $false
    
    if ($permissionLevel -ne "write") {
        Write-Host "ISSUE FOUND: Workflow permissions are READ ONLY" -ForegroundColor Red
        Write-Host ""
        Write-Host "This may prevent GITHUB_TOKEN from triggering workflows." -ForegroundColor Yellow
        Write-Host ""
        $hasIssue = $true
    }
    
    if (-not $canApprovePRs) {
        Write-Host "POTENTIAL ISSUE: Cannot approve/create PRs" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Recommended to enable this setting." -ForegroundColor Yellow
        Write-Host ""
        $hasIssue = $true
    }
    
    if ($hasIssue) {
        Write-Host "========================================"  -ForegroundColor Cyan
        Write-Host "  RECOMMENDED ACTIONS" -ForegroundColor Cyan
        Write-Host "========================================"  -ForegroundColor Cyan
        Write-Host ""
        Write-Host "1. Go to repository settings > Actions" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "2. Under Workflow permissions, select:" -ForegroundColor Yellow
        Write-Host "   - Read and write permissions" -ForegroundColor Green
        Write-Host "   - Allow GitHub Actions to create and approve PRs" -ForegroundColor Green
        Write-Host ""
        Write-Host "3. Click Save" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "NOTE: Even with correct permissions, GITHUB_TOKEN may not" -ForegroundColor Cyan
        Write-Host "trigger other workflows. This is a security feature." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "If issue persists, we need to:" -ForegroundColor Yellow
        Write-Host "  - Use a Personal Access Token (PAT)" -ForegroundColor Yellow
        Write-Host "  - Or explicitly trigger CI via workflow_dispatch" -ForegroundColor Yellow
        Write-Host ""
    } else {
        Write-Host "Permissions look correct!" -ForegroundColor Green
        Write-Host ""
        Write-Host "However, GitHub prevents GITHUB_TOKEN from triggering" -ForegroundColor Cyan
        Write-Host "other workflows by design (prevents infinite loops)." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Solutions:" -ForegroundColor Yellow
        Write-Host "  Option A: Use a Personal Access Token (PAT)" -ForegroundColor Yellow
        Write-Host "  Option B: Add explicit workflow_dispatch trigger" -ForegroundColor Yellow
        Write-Host ""
    }
    
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check manually at repository settings" -ForegroundColor Yellow
    exit 1
}
