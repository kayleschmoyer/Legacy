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
Assert-Equal (Get-RolledUpStatus @("To Do", "To Do")) "To Do" "all todo -> To Do"

# --- Get-RolledUpStatus: LS-4683 epic semantics (LS-8583 parity fix) ---
# A Done child alone is NOT "active work" -- it must never pull a To Do
# epic into In Progress, and an epic reaches "In Review" only when EVERY
# child is In Review or Done (with at least one In Review). The prior
# implementation got both of these backwards: it treated a lone Done child
# as "started" (-> In Progress) and never derived 'In Review' at all, which
# is exactly what let the nightly script demote epics jira-branch-sync had
# correctly parked at In Review.
Assert-Equal (Get-RolledUpStatus @("To Do", "Done")) "To Do" "mixed todo+done -> To Do (LS-4683: done alone isn't active)"
Assert-Equal (Get-RolledUpStatus @("Done", "To Do", "Won't Do")) "To Do" "done + todo + terminal -> To Do (LS-4683: done alone isn't active)"
Assert-Equal (Get-RolledUpStatus @("In Review")) "In Review" "single in-review child -> In Review (LS-4683 tier)"
Assert-Equal (Get-RolledUpStatus @("In Review", "Done")) "In Review" "in-review + done -> In Review (all children In Review/Done)"
Assert-Equal (Get-RolledUpStatus @("In Review", "In Review")) "In Review" "all in-review -> In Review"
Assert-Equal (Get-RolledUpStatus @("In Review", "Won't Do")) "In Review" "in-review + terminal -> In Review (terminal is resolved)"
Assert-Equal (Get-RolledUpStatus @("In Review", "To Do")) "In Progress" "in-review + todo -> In Progress (not ALL children In Review/Done)"
Assert-Equal (Get-RolledUpStatus @("In Review", "In Progress")) "In Progress" "in-review + in-progress -> In Progress (In Progress present)"

# --- Get-RolledUpStatus: terminal statuses count as resolved (LS-8582) ---
Assert-Equal (Get-RolledUpStatus @("Done", "Won't Do")) "Done" "done + won't-do -> Done (terminal is resolved)"
Assert-Equal (Get-RolledUpStatus @("Done", "Cancelled", "Duplicate")) "Done" "done + terminals -> Done"
Assert-Equal (Get-RolledUpStatus @("Won't Do", "Cancelled")) $null "all terminal, no done -> null (leave parent alone)"
Assert-Equal (Get-RolledUpStatus @("To Do", "Won't Do")) "To Do" "todo + terminal -> To Do (terminal is not 'started')"
Assert-Equal (Get-RolledUpStatus @("In Progress", "Won't Do")) "In Progress" "in-progress + terminal -> In Progress"

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

# --- Test-ForwardOnlyTransition: shared leaf-ticket monotonic policy (LS-8583) ---
# Mirrors state-machine.js's forward-rank check for the periodic/non-PR-event
# context this script runs in (see jira-status-audit.yml, which consults the
# same guard with a non-pull_request event and so never applies the one
# narrow downgrade jira-branch-sync permits on specific PR actions).
Assert-Equal (Test-ForwardOnlyTransition "To Do" "In Progress") $true "forward move allowed"
Assert-Equal (Test-ForwardOnlyTransition "To Do" "Done") $true "multi-step forward move allowed"
Assert-Equal (Test-ForwardOnlyTransition "In Review" "In Progress") $false "backward move refused (no PR-action exception here)"
Assert-Equal (Test-ForwardOnlyTransition "Done" "To Do") $false "full backward move refused"
Assert-Equal (Test-ForwardOnlyTransition "In Progress" "In Progress") $false "equal status is not a forward move"
Assert-Equal (Test-ForwardOnlyTransition "Bogus" "Done") $false "unknown current status refused"
Assert-Equal (Test-ForwardOnlyTransition "To Do" "Bogus") $false "unknown target status refused"

# --- Get-JiraTicketKeys: mirrors tools/jira-sync/src/keys.js extractKeys ---
Assert-Equal (Get-JiraTicketKeys "ls-12/foo-LS-9-bar-LS-12") @("LS-12", "LS-9") "extracts, uppercases, dedupes, and sorts"
Assert-Equal (Get-JiraTicketKeys $null) @() "null text -> empty"
Assert-Equal (Get-JiraTicketKeys "") @() "empty text -> empty"
Assert-Equal (Get-JiraTicketKeys "claude/hopeful-darwin-nt7z6b") @() "keyless text -> empty"

# --- Get-DeclaredTicketKey: mirrors marker.js + audit.js's marker -> title -> branch chain ---
$markerBody = @"
Some prose first.

<!-- jira-link
primary: LS-7523
related: LS-7520, ls-7521
-->

**Jira:** [LS-7523](https://bkrupa.atlassian.net/browse/LS-7523)
"@
Assert-Equal (Get-DeclaredTicketKey -Title "chore: misc" -Body $markerBody -Branch "claude/foo") "LS-7523" "valid marker with primary+related -> primary"

$primaryOnly = "<!-- jira-link`nprimary: LS-1`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "" -Body $primaryOnly -Branch "") "LS-1" "primary-only marker"

Assert-Equal (Get-DeclaredTicketKey -Title "LS-1234: fix things" -Body "closes LS-1234 in prose only" -Branch "claude/foo") "LS-1234" "no marker block -> title fallback"
Assert-Equal (Get-DeclaredTicketKey -Title "no ticket here" -Body $null -Branch "LS-4321-fix-thing") "LS-4321" "no marker, no title key -> branch fallback"
Assert-Equal (Get-DeclaredTicketKey -Title "" -Body $null -Branch "claude/hopeful-darwin") $null "nothing resolves -> null"

$decoyBody = @"
unblocks LS-9999 and mentions LS-8888
<!-- jira-link
primary: LS-7523
-->
also LS-7777 down here
"@
Assert-Equal (Get-DeclaredTicketKey -Title "port of LS-5910" -Body $decoyBody -Branch "claude/foo") "LS-7523" "decoy keys outside the marker block are ignored"

$noneMarker = "<!-- jira-link`nprimary: none`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999 mentioned in title" -Body $noneMarker -Branch "claude/foo") $null "primary: none is an explicit opt-out (no title fallback)"

$multiPrimary = "<!-- jira-link`nprimary: LS-1`nprimary: LS-2`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999" -Body $multiPrimary -Branch "claude/foo") $null "multiple primaries -> invalid marker (no title fallback)"

$missingPrimary = "<!-- jira-link`nrelated: LS-1`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999" -Body $missingPrimary -Branch "claude/foo") $null "missing primary field -> invalid marker (no title fallback)"

$malformedLine = "<!-- jira-link`nthis is not a field`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999" -Body $malformedLine -Branch "claude/foo") $null "unparseable marker line -> invalid (no title fallback)"

$badKeyPrimary = "<!-- jira-link`nprimary: not-a-key`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999" -Body $badKeyPrimary -Branch "claude/foo") $null "malformed primary key -> invalid (no title fallback)"

$unknownField = "<!-- jira-link`nprimary: LS-1`nbogus: x`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999" -Body $unknownField -Branch "claude/foo") $null "unknown marker field -> invalid (no title fallback)"

$badRelated = "<!-- jira-link`nrelated: LS-1, nope`nprimary: LS-2`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "LS-9999" -Body $badRelated -Branch "claude/foo") $null "malformed related key -> invalid marker (no title fallback)"

# The exact scenario from the LS-8583 ticket: a foreign ticket mentioned in
# the title must never be picked up when a valid marker declares the real one.
$portOfBody = "<!-- jira-link`nprimary: LS-8583`n-->"
Assert-Equal (Get-DeclaredTicketKey -Title "fix: port of LS-5910 to new API" -Body $portOfBody -Branch "claude/some-branch") "LS-8583" "marker wins over an unrelated 'port of LS-####' title mention"

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
