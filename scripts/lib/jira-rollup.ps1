# Pure rollup helpers for sync-jira-status.ps1.
#
# These functions are side-effect free (no acli/git/network calls) so they can be
# unit-tested in isolation. They are dot-sourced by:
#   - scripts/sync-jira-status.ps1            (the operational script)
#   - scripts/__tests__/jira-rollup.test.ps1  (plain-PowerShell assertions)
#
# The Jira workflow is linear: To Do -> In Progress -> In Review -> Done. Parent
# issues (anything with children) only ever roll up to To Do / In Progress / Done;
# "In Review" is a leaf-only state tied to an open PR.

$JiraWorkflowOrder = @('To Do', 'In Progress', 'In Review', 'Done')

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
        (Task -> Story -> Epic -> Initiative):
          - no children            -> $null  (caller skips; not a parent)
          - all children Done      -> 'Done'
          - any child started      -> 'In Progress'
            (In Progress / In Review / Done), but not all Done
          - all children To Do     -> 'To Do'
    .PARAMETER ChildStatuses
        The status names of the parent's direct children.
    #>
    param([string[]]$ChildStatuses)

    if (-not $ChildStatuses -or $ChildStatuses.Count -eq 0) {
        return $null
    }

    $startedStatuses = @('In Progress', 'In Review', 'Done')
    $allDone = $true
    $anyStarted = $false

    foreach ($status in $ChildStatuses) {
        if ($status -ne 'Done') { $allDone = $false }
        if ($startedStatuses -contains $status) { $anyStarted = $true }
    }

    if ($allDone) { return 'Done' }
    if ($anyStarted) { return 'In Progress' }
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
