#!/usr/bin/env pwsh
# Auto-resolve cascade conflicts
# This script automatically resolves common conflicts during twig cascade

$maxIterations = 20
$iteration = 0

while ($iteration -lt $maxIterations) {
    $iteration++
    Write-Host "`n=== Iteration $iteration ===" -ForegroundColor Cyan
    
    # Check if we're in a rebase
    $rebaseStatus = git status 2>&1
    if ($rebaseStatus -notmatch "rebase in progress") {
        Write-Host "No rebase in progress. Running twig cascade..." -ForegroundColor Green
        twig cascade
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✓ Cascade completed successfully!" -ForegroundColor Green
            exit 0
        }
        # If twig cascade fails, it likely hit conflicts
        continue
    }
    
    # Get conflicted files
    $conflictedFiles = git diff --name-only --diff-filter=U
    
    if (-not $conflictedFiles) {
        Write-Host "No conflicts detected. Continuing rebase..." -ForegroundColor Yellow
        $env:GIT_EDITOR = "true"
        git rebase --continue
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Rebase continued successfully" -ForegroundColor Green
            continue
        } else {
            Write-Host "Rebase continue failed" -ForegroundColor Red
            break
        }
    }
    
    Write-Host "Resolving conflicts in: $($conflictedFiles -join ', ')" -ForegroundColor Yellow
    
    # Resolve each file based on pattern
    foreach ($file in $conflictedFiles) {
        Write-Host "  Resolving: $file" -ForegroundColor Cyan
        
        if ($file -match "usePlayerProjections\.ts") {
            # Keep ours (HEAD) - single import
            git checkout --ours $file
            git add $file
            Write-Host "    → Used --ours (keep single import)" -ForegroundColor Green
        }
        elseif ($file -match "graphql-schema\.md") {
            # Keep theirs - remove duplicates
            git checkout --theirs $file
            git add $file
            Write-Host "    → Used --theirs (remove duplicates)" -ForegroundColor Green
        }
        elseif ($file -match "package\.json") {
            # Keep theirs for package.json
            git checkout --theirs $file
            git add $file
            Write-Host "    → Used --theirs (newer package.json)" -ForegroundColor Green
        }
        elseif ($file -match "migrations/.*\.ts") {
            # Keep theirs for migrations (remove BOM)
            git checkout --theirs $file
            git add $file
            Write-Host "    → Used --theirs (migration file)" -ForegroundColor Green
        }
        else {
            Write-Host "    → Unknown file pattern, manual resolution needed" -ForegroundColor Red
            Write-Host "Please resolve $file manually and press Enter to continue..."
            Read-Host
            git add $file
        }
    }
    
    # Continue rebase
    Write-Host "Continuing rebase..." -ForegroundColor Cyan
    $env:GIT_EDITOR = "true"
    git rebase --continue
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Rebase continue failed. Check for remaining conflicts." -ForegroundColor Red
        git status
        break
    }
}

if ($iteration -ge $maxIterations) {
    Write-Host "`n⚠️  Reached maximum iterations ($maxIterations)" -ForegroundColor Yellow
    Write-Host "Run the script again to continue or check remaining branches with twig tree" -ForegroundColor Yellow
}
