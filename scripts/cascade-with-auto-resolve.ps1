# Cascade with automatic conflict resolution for migration files
# Resolves "both added" conflicts by accepting current branch version

param(
    [Parameter(Mandatory=$false)]
    [string]$StartBranch = "LS-25/implement-matchup-notification-system-sns-push"
)

$ErrorActionPreference = "Continue"

Write-Host "=== Cascading with Auto-Resolve ===" -ForegroundColor Cyan
Write-Host ""

# Branches to cascade in order
$branches = @(
    "LS-25/implement-matchup-notification-system-sns-push",
    "LS-26/build-automated-matchup-progression-system",
    "LS-27/add-matchup-analytics-and-statistics-dashboard",
    "LS-28/implement-playoff-bracket-system-with-automatic-seeding",
    "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups",
    "LS-30/build-matchup-preview-and-predictions-feature",
    "LS-31/matchup-chat",
    "LS-34/performance-optimization-for-matchup-queries-and-operations"
)

# Find start index
$startIndex = $branches.IndexOf($StartBranch)
if ($startIndex -lt 0) {
    Write-Host "❌ Branch '$StartBranch' not found in list" -ForegroundColor Red
    exit 1
}

# Process each branch
for ($i = $startIndex; $i -lt $branches.Count; $i++) {
    $branch = $branches[$i]
    Write-Host "`n=== Processing: $branch ===" -ForegroundColor Yellow
    
    # Checkout branch
    $null = git checkout $branch 2>&1
    
    # Run twig rebase
    Write-Host "Running twig rebase..." -ForegroundColor Cyan
    
    # Use a temporary file to capture twig output and respond to prompts
    $tempScript = [System.IO.Path]::GetTempFileName() + ".ps1"
    
    @"
`$process = Start-Process -FilePath "twig" -ArgumentList "rebase" -NoNewWindow -PassThru -RedirectStandardInput "`$input"
Start-Sleep -Milliseconds 500

# Check if process is still running (waiting for input)
if (-not `$process.HasExited) {
    # Send "1" (Continue option) followed by Enter
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait("1{ENTER}")
}

`$process.WaitForExit()
`$process.ExitCode
"@ | Out-File -FilePath $tempScript
    
    # Try rebase (will fail with conflicts)
    & twig rebase 2>&1 | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        # Check if we're in a rebase with conflicts
        if (Test-Path .git/rebase-merge) {
            Write-Host "  Conflicts detected, auto-resolving..." -ForegroundColor Yellow
            
            # Resolve conflicts by accepting current version
            $conflicts = git diff --name-only --diff-filter=U 2>&1
            
            if ($conflicts) {
                foreach ($file in $conflicts) {
                    if ($file -match "migrations.*\.ts$") {
                        Write-Host "    Resolving: $file" -ForegroundColor Gray
                        git checkout --ours $file 2>&1 | Out-Null
                        git add $file 2>&1 | Out-Null
                    }
                }
                
                # Continue rebase
                Write-Host "  Continuing rebase..." -ForegroundColor Cyan
                git rebase --continue 2>&1 | Out-Null
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  ✅ Successfully rebased!" -ForegroundColor Green
                } else {
                    Write-Host "  ⚠️  Rebase continued but may need manual intervention" -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host "  ℹ️  No rebase in progress (branch may be up-to-date)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✅ Already up-to-date!" -ForegroundColor Green
    }
    
    # Clean up temp file
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force
    }
}

Write-Host "`n=== Cascade Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: Push all branches with:"
Write-Host "  git checkout main && twig tree" -ForegroundColor Cyan
