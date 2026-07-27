# Pure rollup helpers for sync-jira-status.ps1.
#
# These functions are side-effect free (no acli/git/network calls) so they can be
# unit-tested in isolation. They are dot-sourced by:
#   - scripts/sync-jira-status.ps1            (the operational script)
#   - scripts/__tests__/jira-rollup.test.ps1  (plain-PowerShell assertions)
#
# The Jira workflow is linear: To Do -> In Progress -> In Review -> Done.
#
# Shared-policy note (LS-8583): this file mirrors, in PowerShell, the rules
# that .github/workflows/jira-branch-sync.yml and jira-status-audit.yml apply
# via the unit-tested tools/jira-sync/ package. Keep it in lockstep with that
# package's specs -- add a matching PS test case here for every JS spec case
# that changes the contract:
#   - Get-RolledUpStatus  mirrors the epic-rollup bash in both workflows
#     (LS-4683: a Done child alone never counts as "active work"; an epic
#     only reaches "In Review" when ALL children are In Review or Done).
#     This tier is deliberately BIDIRECTIONAL, matching jira-status-audit.yml's
#     epic audit, which explicitly demotes a Done epic when a child reopens.
#   - Test-ForwardOnlyTransition mirrors tools/jira-sync/src/state-machine.js's
#     monotonic guard for LEAF ticket transitions. jira-branch-sync.yml permits
#     one narrow backward move (In Review -> In Progress) but only on specific
#     pull_request actions; jira-status-audit.yml -- the GHA's own periodic
#     counterpart to this script -- consults that same guard with a
#     non-pull_request event, under which the downgrade never applies, so its
#     periodic repairs are forward-only in practice. This script runs in that
#     same periodic context, so leaf transitions here are forward-only, full
#     stop -- a policy decision separate from (and intentionally opposite of)
#     the bidirectional rollup tier above.
#   - Get-DeclaredTicketKey mirrors tools/jira-sync/src/marker.js +
#     keys.js + audit.js's marker -> title -> branch key-selection fallback
#     chain (marker-first). Replaces a prior body closing-keyword sweep
#     (including "completes", not a real GitHub keyword) that could
#     associate foreign tickets mentioned in a title (e.g. "port of LS-5910").

$JiraWorkflowOrder = @('To Do', 'In Progress', 'In Review', 'Done')

# Terminal non-Done statuses: the ticket is closed but no work was delivered.
# The leaf pass never transitions these; the rollup treats them as resolved
# (a "Won't Do" child must not hold its parent in In Progress forever).
$JiraTerminalStatuses = @("Won't Do", 'Cancelled', 'Rejected', 'Duplicate')

function ConvertFrom-JsonArray {
    <#
    .SYNOPSIS
        Parse JSON text (a string or an array of lines) and always return an
        array, identically under Windows PowerShell 5.1 and pwsh 7.
    .DESCRIPTION
        Native-command output is captured as a string[] of lines, and the two
        PowerShell generations disagree about JSON arrays: 5.1's
        ConvertFrom-Json emits the whole array as ONE object while pwsh 7
        enumerates its elements. Wrapping the *pipeline* in @() therefore
        yields a one-element wrapper under 5.1 — `@($json | ConvertFrom-Json)`
        silently collapsed every multi-item result to Count=1 (LS-8582: this
        killed PR detection, the child-truncation guard, and AllOpen rollup
        discovery). This helper joins the lines, parses once via -InputObject
        (no pipeline enumeration), and @()-wraps the resulting *variable*,
        which is stable across versions.

        Returns @() for empty/whitespace input or a parse failure; a JSON
        object (non-array) comes back as a one-element array.
    #>
    param([object]$Json)

    $text = if ($Json -is [array]) { $Json -join "`n" } else { [string]$Json }
    if (-not $text -or -not $text.Trim()) { return , @() }

    try {
        $parsed = ConvertFrom-Json -InputObject $text
    } catch {
        return , @()
    }

    # Drop JSON nulls (a literal `null` document or null array elements) so the
    # contract is "array of real items" -- a $null element would otherwise flow
    # into hashtable-key positions downstream and throw (LS-8582 smoke run).
    # Comma operator keeps the array shape through the function-return unwrap.
    return , @($parsed | Where-Object { $null -ne $_ })
}

function Test-JiraKey {
    <#
    .SYNOPSIS
        $true only if $Key is a well-formed Jira issue key (e.g. LS-1234).
    .DESCRIPTION
        A guard against command / JQL injection: keys ultimately derive from
        user-controlled Git branch names, so every key is validated against this
        strict pattern before it is interpolated into an acli command or a
        --jql string. PROJECT-123 only: uppercase project, digits, nothing else.
    #>
    param([string]$Key)
    # -cmatch (case-sensitive): PowerShell's -match is case-insensitive, which
    # would let a lowercase project (e.g. "ls-1234") slip past the uppercase-only
    # guard. Keys are an injection surface, so reject anything not strictly
    # PROJECT-123 with an uppercase project.
    return [bool]($Key -cmatch '^[A-Z][A-Z0-9_]+-\d+$')
}

function Test-JiraProjectKey {
    <#
    .SYNOPSIS
        $true only if $Key is a well-formed Jira project key (e.g. LS).
    #>
    param([string]$Key)
    # -cmatch (case-sensitive): see Test-JiraKey — reject lowercase project keys.
    return [bool]($Key -cmatch '^[A-Z][A-Z0-9_]+$')
}

function Get-RolledUpStatus {
    <#
    .SYNOPSIS
        Derive a parent's status from the statuses of its direct children.
    .DESCRIPTION
        Applied identically at every level of the hierarchy
        (Task -> Story -> Epic -> Initiative), matching the epic-rollup rules
        in jira-branch-sync.yml / jira-status-audit.yml (LS-4683; see LS-8583
        for the parity fix -- this used to treat a lone Done child as
        "started", contradicting LS-4683, and never derived 'In Review' at
        all):
          - no children                        -> $null  (caller skips; not a parent)
          - all children resolved, any Done    -> 'Done'
            (resolved = Done or a terminal status: Won't Do / Cancelled / ...)
          - all children terminal (no Done)    -> $null  (all cancelled; nothing
            meaningful to derive -- caller leaves the parent as-is)
          - not all resolved, all children
            Done / terminal / In Review,
            at least one In Review            -> 'In Review'
          - any child In Progress or In Review -> 'In Progress'
            (Done alone is NOT "active work" -- LS-4683)
          - otherwise (To Do / terminal mix)   -> 'To Do'
    .PARAMETER ChildStatuses
        The status names of the parent's direct children.
    #>
    param([string[]]$ChildStatuses)

    if (-not $ChildStatuses -or $ChildStatuses.Count -eq 0) {
        return $null
    }

    $anyDone = $false
    $anyInReview = $false
    $anyActive = $false           # In Progress or In Review only -- Done
                                   # alone is not "active work" (LS-4683).
    $allResolved = $true          # every child is Done or terminal
    $allReviewOrResolved = $true  # every child is Done, terminal, or In Review

    foreach ($status in $ChildStatuses) {
        $isDone = $status -eq 'Done'
        $isTerminal = $JiraTerminalStatuses -contains $status
        $isInReview = $status -eq 'In Review'
        $isInProgress = $status -eq 'In Progress'

        if ($isDone) { $anyDone = $true }
        if ($isInReview) { $anyInReview = $true; $anyActive = $true }
        if ($isInProgress) { $anyActive = $true }

        if (-not ($isDone -or $isTerminal)) { $allResolved = $false }
        if (-not ($isDone -or $isTerminal -or $isInReview)) { $allReviewOrResolved = $false }
    }

    if ($allResolved) {
        if ($anyDone) { return 'Done' }
        return $null
    }
    if ($allReviewOrResolved -and $anyInReview) {
        return 'In Review'
    }
    if ($anyActive) {
        return 'In Progress'
    }
    return 'To Do'
}

function Get-TransitionPath {
    <#
    .SYNOPSIS
        Ordered list of intermediate statuses to step through to get from
        Current to Target, walking the linear workflow in either direction.
    .DESCRIPTION
        Jira workflows require stepping through each adjacent status rather than
        jumping. This returns every status to transition into, in order:
          To Do      -> Done           => @('In Progress', 'In Review', 'Done')
          Done       -> In Progress    => @('In Review', 'In Progress')   (backward)
          In Progress-> In Progress    => @()                             (no-op)
        Returns an empty array when either status is unknown or they are equal,
        so the caller can treat "nothing to do" uniformly.
    #>
    param(
        [string]$CurrentStatus,
        [string]$TargetStatus,
        [string[]]$WorkflowOrder = $JiraWorkflowOrder
    )

    $currentIdx = $WorkflowOrder.IndexOf($CurrentStatus)
    $targetIdx = $WorkflowOrder.IndexOf($TargetStatus)

    if ($currentIdx -lt 0 -or $targetIdx -lt 0 -or $currentIdx -eq $targetIdx) {
        return @()
    }

    $path = @()
    if ($currentIdx -lt $targetIdx) {
        for ($i = $currentIdx + 1; $i -le $targetIdx; $i++) { $path += $WorkflowOrder[$i] }
    } else {
        for ($i = $currentIdx - 1; $i -ge $targetIdx; $i--) { $path += $WorkflowOrder[$i] }
    }

    # Comma operator keeps a single-element result an array, not a scalar.
    return , $path
}

function Test-ForwardOnlyTransition {
    <#
    .SYNOPSIS
        $true only if $Target is strictly forward of $Current along the Jira
        workflow order -- the shared monotonic policy for LEAF ticket
        transitions in this script's periodic reconciliation context (LS-8583).
    .DESCRIPTION
        Mirrors the forward-rank check in tools/jira-sync/src/state-machine.js
        (isAllowedMove). That guard also permits one narrow backward move
        (In Review -> In Progress), but only when triggered by a specific
        pull_request action (closed without merging, or converted to draft).
        jira-status-audit.yml -- the GHA's own periodic/non-event counterpart
        to this script -- consults the identical guard with a non-pull_request
        event, under which that downgrade never applies, making its periodic
        repairs forward-only in practice. This script runs in that same
        periodic context, so leaf-ticket transitions here are forward-only,
        full stop; there is no event to justify the narrow exception.

        This is intentionally separate from (and the opposite policy of)
        Get-RolledUpStatus's parent/epic rollup, which is bidirectional by
        design -- see that function's doc comment.
    .PARAMETER Current
        The ticket's current Jira status.
    .PARAMETER Target
        The status a caller wants to transition the ticket to.
    #>
    param(
        [string]$Current,
        [string]$Target,
        [string[]]$WorkflowOrder = $JiraWorkflowOrder
    )

    $currentIdx = $WorkflowOrder.IndexOf($Current)
    $targetIdx = $WorkflowOrder.IndexOf($Target)

    if ($currentIdx -lt 0 -or $targetIdx -lt 0) {
        return $false
    }
    return $targetIdx -gt $currentIdx
}

function Get-JiraTicketKeys {
    <#
    .SYNOPSIS
        Extract all LS-#### ticket keys from a piece of text: uppercased,
        deduplicated, and sorted for deterministic output.
    .DESCRIPTION
        PowerShell mirror of tools/jira-sync/src/keys.js's extractKeys --
        keep the two in lockstep (see its extractKeys tests in marker.spec.ts).
    #>
    param([string]$Text)

    if (-not $Text) { return @() }
    $found = [regex]::Matches($Text, 'LS-\d+', 'IgnoreCase') |
        ForEach-Object { $_.Value.ToUpperInvariant() }
    # Comma operator keeps a single-match result an array, not a scalar --
    # otherwise callers indexing [0] on a one-key result would index into the
    # key STRING's characters instead (see Get-TransitionPath above).
    return , @($found | Select-Object -Unique | Sort-Object)
}

function Get-DeclaredTicketKey {
    <#
    .SYNOPSIS
        The single ticket key a PR declares: marker-first, falling back to
        the PR title, then the branch name. Returns $null when nothing
        resolves, or the marker explicitly declares "primary: none".
    .DESCRIPTION
        PowerShell mirror of tools/jira-sync/src/marker.js's parseMarker
        (the <!-- jira-link --> block) composed with audit.js's planAudit
        fallback chain (marker -> title -> branch). Keep the two in lockstep
        -- add a matching PS test case here for every marker.spec.ts /
        audit.spec.ts case that changes the contract.

        Decoy LS-#### mentions elsewhere in the body (e.g. "unblocks LS-9999")
        are never picked up -- only a key inside the jira-link block, or (when
        no block is present) the title/branch fallback, counts. A marker that
        is present but malformed (unparseable line, multiple/missing primary,
        invalid key, unknown field, invalid related key) resolves to $null
        without falling back to title/branch -- matching marker.js, which
        treats "present but invalid" as "transition nothing", not "try the
        next source".
    .PARAMETER Title
        PR title text.
    .PARAMETER Body
        PR body text (searched for the jira-link marker block).
    .PARAMETER Branch
        Head branch name, used only when body has no marker and title has no key.
    #>
    param(
        [string]$Title,
        [string]$Body,
        [string]$Branch
    )

    if ($Body) {
        $blockMatch = [regex]::Match($Body, '<!--\s*jira-link\b([\s\S]*?)-->', 'IgnoreCase')
        if ($blockMatch.Success) {
            $primaries = @()
            $invalid = $false

            foreach ($rawLine in ($blockMatch.Groups[1].Value -split '\r?\n')) {
                $line = $rawLine.Trim()
                if ($line -eq '') { continue }

                $fieldMatch = [regex]::Match($line, '^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$')
                if (-not $fieldMatch.Success) { $invalid = $true; break }

                $field = $fieldMatch.Groups[1].Value.ToLowerInvariant()
                $value = $fieldMatch.Groups[2].Value.Trim()

                if ($field -eq 'primary') {
                    $primaries += $value
                } elseif ($field -eq 'related') {
                    foreach ($token in ($value -split '[\s,]+')) {
                        if ($token -eq '') { continue }
                        if ($token -notmatch '(?i)^LS-\d+$') { $invalid = $true; break }
                    }
                    if ($invalid) { break }
                } else {
                    $invalid = $true
                    break
                }
            }

            # Marker present but malformed: matches marker.js/plan.js/audit.js
            # -- transition nothing, do not fall back to title/branch.
            if ($invalid -or $primaries.Count -ne 1) {
                return $null
            }

            $primaryValue = $primaries[0]
            if ($primaryValue.ToLowerInvariant() -eq 'none') {
                return $null
            }
            if ($primaryValue -match '(?i)^LS-\d+$') {
                return $primaryValue.ToUpperInvariant()
            }
            return $null
        }
    }

    $titleKeys = Get-JiraTicketKeys -Text $Title
    if ($titleKeys.Count -gt 0) { return $titleKeys[0] }

    $branchKeys = Get-JiraTicketKeys -Text $Branch
    if ($branchKeys.Count -gt 0) { return $branchKeys[0] }

    return $null
}
