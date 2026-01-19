# Script to rebase all matchup-related branches in sequence
# This fixes the inheritance of changes from LS-7 through all child branches

$branches = @(
    "LS-19/build-graphql-schema-and-resolvers-for-matchup-operations",
    "LS-20/implement-matchup-scheduling-algorithm-for-fantasy-leagues",
    "LS-21/build-matchup-score-calculation-engine",
    "LS-22/create-matchup-history-and-results-tracking-system",
    "LS-23/build-mobile-matchup-ui-components-react-native",
    "LS-24/build-web-matchup-ui-components-next-js",
    "LS-25/implement-matchup-notification-system-sns-push",
    "LS-26/build-automated-matchup-progression-system",
    "LS-27/add-matchup-analytics-and-statistics-dashboard",
    "LS-28/implement-playoff-bracket-system-with-automatic-seeding",
    "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups",
    "LS-30/build-matchup-preview-and-predictions-feature",
    "LS-31/matchup-chat",
    "LS-32/implement-tiebreaker-rules-system-for-matchups"
)

$parentBranch = "LS-18/extend-matchup-database-schema-to-support-team-pairings-and-scoring"

foreach ($branch in $branches) {
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "Processing: $branch" -ForegroundColor Yellow
    Write-Host "Parent: $parentBranch" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Cyan
    
    # Checkout the branch
    Write-Host "Checking out $branch..." -ForegroundColor White
    git checkout $branch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to checkout $branch" -ForegroundColor Red
        exit 1
    }
    
    # Rebase onto parent
    Write-Host "Rebasing onto $parentBranch..." -ForegroundColor White
    git rebase $parentBranch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Rebase failed for $branch" -ForegroundColor Red
        Write-Host "Please resolve conflicts manually and run:" -ForegroundColor Yellow
        Write-Host "  git rebase --continue" -ForegroundColor Yellow
        Write-Host "  git push origin HEAD --force-with-lease" -ForegroundColor Yellow
        exit 1
    }
    
    # Push the rebased branch
    Write-Host "Pushing $branch..." -ForegroundColor White
    git push origin HEAD --force-with-lease
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to push $branch" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✓ Successfully rebased and pushed $branch" -ForegroundColor Green
    Write-Host ""
    
    # This branch becomes the parent for the next one
    $parentBranch = $branch
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "✓ All branches rebased successfully!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
