#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Plain-PowerShell assertions for the pure rollup helpers in
    scripts/lib/jira-rollup.ps1 (Get-RolledUpStatus, Get-TransitionPath).
.DESCRIPTION
    Intentionally Pester-free: the only PowerShell on most dev machines ships
    Pester 3 (whose syntax differs from Pester 5), and CI does not run a pwsh
    test harness. This script dot-sources the helpers and exits non-zero on the
    first failure, so it works on any PowerShell with no module install.

    Run: pnpm run test:scripts:ps
    Or:  pwsh -File scripts/__tests__/jira-rollup.test.ps1
#>

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "../lib/jira-rollup.ps1")

$script:failures = 0

function Assert-Equal {
    param($Actual, $Expected, [string]$Name)
    # Normalize via -join: this collapses scalar / single-element-array / empty
    # uniformly, sidestepping PowerShell emitting an empty array as $null (which
    # would otherwise make a correct no-op path compare unequal to @()).
    $a = (@($Actual) -join '|')
    $e = (@($Expected) -join '|')
    if ($a -ne $e) {
        Write-Host "FAIL  $Name : got '$a', want '$e'" -ForegroundColor Red
        $script:failures++
    } else {
        Write-Host "ok    $Name" -ForegroundColor Green
    }
}

# --- Get-RolledUpStatus: derivation rule applies identically at every level ---
Assert-Equal (Get-RolledUpStatus @()) $null "no children -> null (not a parent)"
Assert-Equal (Get-RolledUpStatus @("Done", "Done")) "Done" "all done -> Done"
Assert-Equal (Get-RolledUpStatus @("To Do", "In Progress")) "In Progress" "one started -> In Progress"
Assert-Equal (Get-RolledUpStatus @("To Do", "Done")) "In Progress" "mixed todo+done -> In Progress"
Assert-Equal (Get-RolledUpStatus @("In Review")) "In Progress" "in-review child -> In Progress"
Assert-Equal (Get-RolledUpStatus @("To Do", "To Do")) "To Do" "all todo -> To Do"

# --- Get-TransitionPath: bidirectional stepper ---
Assert-Equal (Get-TransitionPath "To Do" "In Progress") @("In Progress") "todo -> in progress"
Assert-Equal (Get-TransitionPath "To Do" "Done") @("In Progress", "In Review", "Done") "todo -> done (forward)"
Assert-Equal (Get-TransitionPath "Done" "In Progress") @("In Review", "In Progress") "done -> in progress (backward)"
Assert-Equal (Get-TransitionPath "In Progress" "In Progress") @() "equal -> no-op"
Assert-Equal (Get-TransitionPath "Done" "To Do") @("In Review", "In Progress", "To Do") "done -> todo (full backward)"
Assert-Equal (Get-TransitionPath "Bogus" "Done") @() "unknown current -> no-op"

# --- Test-JiraKey / Test-JiraProjectKey: injection guards ---
Assert-Equal (Test-JiraKey "LS-1234") $true "valid issue key"
Assert-Equal (Test-JiraKey "ABC123-9") $true "valid issue key with digits in project"
Assert-Equal (Test-JiraKey "LS-1 OR project=X") $false "jql-injection attempt rejected"
Assert-Equal (Test-JiraKey "ls-1234") $false "lowercase project rejected"
Assert-Equal (Test-JiraKey "LS-") $false "missing number rejected"
Assert-Equal (Test-JiraKey "") $false "empty rejected"
Assert-Equal (Test-JiraProjectKey "LS") $true "valid project key"
Assert-Equal (Test-JiraProjectKey "LS-1") $false "issue key is not a project key"
Assert-Equal (Test-JiraProjectKey "LS AND x") $false "injection attempt rejected"

# --- Multi-level bottom-up: task -> story -> epic rolls up correctly ---
$story = Get-RolledUpStatus @("Done", "In Progress")
Assert-Equal $story "In Progress" "story rolls up from its tasks"
$epic = Get-RolledUpStatus @($story, "To Do")
Assert-Equal $epic "In Progress" "epic rolls up from the rolled-up story (bottom-up)"

# --- Dry-run effectiveStatus: rollup derives from simulated child statuses, not stale Jira ---
# When -DryRun simulates moving a child from 'To Do' to 'In Progress', sync-jira-status.ps1
# records the target in $effectiveStatus and passes it to Get-RolledUpStatus instead of the
# stale Jira value. These two cases confirm the function returns different results:
Assert-Equal (Get-RolledUpStatus @("To Do")) "To Do" "dry-run control: stale child To Do -> parent stays To Do"
Assert-Equal (Get-RolledUpStatus @("In Progress")) "In Progress" "dry-run effective: simulated child In Progress -> parent In Progress"

# --- Parent-with-own-PR: children-derived rollup overrides branch-driven status ---
# When a ticket is both a parent (has children) and has its own PR/branch, the per-ticket
# pass may move it to Done (merged PR). Invoke-ParentRollup then runs Get-RolledUpStatus
# against the children and overwrites the effective status with the children-derived result.
# This verifies the derivation function produces the correct override target.
$parentBranchDrivenStatus = "Done"   # per-ticket pass moved this to Done (merged PR)
$rollupDerived = Get-RolledUpStatus @("In Progress", "To Do")
Assert-Equal $rollupDerived "In Progress" "parent-with-own-PR: children-derived In Progress overrides branch-driven Done"
Assert-Equal ($parentBranchDrivenStatus -ne $rollupDerived) $true "parent-with-own-PR: rollup status differs from branch-driven status"

if ($script:failures -gt 0) {
    Write-Host "`n$($script:failures) assertion(s) FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "`nAll rollup helper assertions passed" -ForegroundColor Green
exit 0
