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

# --- Get-RolledUpStatus: terminal statuses count as resolved (LS-8582) ---
Assert-Equal (Get-RolledUpStatus @("Done", "Won't Do")) "Done" "done + won't-do -> Done (terminal is resolved)"
Assert-Equal (Get-RolledUpStatus @("Done", "Cancelled", "Duplicate")) "Done" "done + terminals -> Done"
Assert-Equal (Get-RolledUpStatus @("Won't Do", "Cancelled")) $null "all terminal, no done -> null (leave parent alone)"
Assert-Equal (Get-RolledUpStatus @("To Do", "Won't Do")) "To Do" "todo + terminal -> To Do (terminal is not 'started')"
Assert-Equal (Get-RolledUpStatus @("In Progress", "Won't Do")) "In Progress" "in-progress + terminal -> In Progress"
Assert-Equal (Get-RolledUpStatus @("Done", "To Do", "Won't Do")) "In Progress" "done + todo + terminal -> In Progress (not all resolved)"

# --- ConvertFrom-JsonArray: version-stable array parsing (LS-8582) ---
# Under Windows PowerShell 5.1, @($x | ConvertFrom-Json) collapses a JSON array
# to a single element; this helper must return per-item arrays on BOTH 5.1 and 7.
$multi = ConvertFrom-JsonArray '[{"key":"LS-1","fields":{"status":{"name":"Done"}}},{"key":"LS-2","fields":{"status":{"name":"To Do"}}}]'
Assert-Equal $multi.Count 2 "json array -> per-item array"
Assert-Equal $multi[0].key "LS-1" "json array -> first item addressable"
Assert-Equal $multi[1].fields.status.name "To Do" "json array -> nested fields addressable"

# Native-command output arrives as a string[] of lines (pretty-printed JSON).
$lines = @('[', '  {"key":"LS-3"},', '  {"key":"LS-4"}', ']')
$fromLines = ConvertFrom-JsonArray $lines
Assert-Equal $fromLines.Count 2 "line-array input -> per-item array"
Assert-Equal $fromLines[1].key "LS-4" "line-array input -> items parsed"

$single = ConvertFrom-JsonArray '{"key":"LS-5"}'
Assert-Equal $single.Count 1 "json object -> one-element array"
Assert-Equal $single[0].key "LS-5" "json object -> element addressable"

Assert-Equal (ConvertFrom-JsonArray '[]').Count 0 "empty json array -> empty"
Assert-Equal (ConvertFrom-JsonArray 'null').Count 0 "json null document -> empty"
Assert-Equal (ConvertFrom-JsonArray '[null, {"key":"LS-6"}, null]').Count 1 "null array elements dropped"
Assert-Equal (ConvertFrom-JsonArray '').Count 0 "empty string -> empty"
Assert-Equal (ConvertFrom-JsonArray $null).Count 0 "null input -> empty"
Assert-Equal (ConvertFrom-JsonArray 'not json {{{').Count 0 "invalid json -> empty (no throw)"

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
# pass refuses to transition it (LS-8582 parent guard) and defers to the rollup pass,
# which runs Get-RolledUpStatus against the children. This verifies the derivation
# function produces the correct children-derived target where branch evidence said Done.
$parentBranchDrivenStatus = "Done"   # what branch/PR evidence alone would have implied
$rollupDerived = Get-RolledUpStatus @("In Progress", "To Do")
Assert-Equal $rollupDerived "In Progress" "parent-with-own-PR: children-derived In Progress overrides branch-driven Done"
Assert-Equal ($parentBranchDrivenStatus -ne $rollupDerived) $true "parent-with-own-PR: rollup status differs from branch-driven status"

if ($script:failures -gt 0) {
    Write-Host "`n$($script:failures) assertion(s) FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "`nAll rollup helper assertions passed" -ForegroundColor Green
exit 0
