# Base-ref resolution helpers for scripts/worktree-create.ps1 (LS-9791).
#
# These functions are dot-sourced by:
#   - scripts/worktree-create.ps1                 (the operational script)
#   - scripts/__tests__/worktree-base.test.ps1    (plain-PowerShell assertions)
#
# WHY THIS EXISTS
# ---------------
# `twig worktree create <branch>` takes no base ref: when the branch does not
# already exist it cuts it from the main repo's *checked-out* HEAD, i.e. the
# LOCAL `main` ref. worktree-create.ps1 runs `git fetch origin` first, which
# updates `refs/remotes/origin/main` -- but nothing consumed it, so every
# worktree created while local main was behind origin/main started stale.
#
# The failure is silent whenever the stale range happens not to touch the files
# being edited, which is most of the time. It is worst in exactly the situation
# where it is most likely: a session that just merged a PR and immediately opens
# the follow-up worktree (the stacked-work pattern this repo encourages). An
# agent then edits a file it believes exists, gets "no such file", and can
# reasonably conclude the previous PR did not land -- or recreate the file and
# produce a conflicting duplicate.
#
# THE FIX
# -------
# Pre-create the branch at the remote-tracking ref (`origin/<parent>`) BEFORE
# calling twig. twig reports "Using existing branch: <branch>" and adopts it, so
# the worktree lands on the pushed remote state. This matches the intent of the
# pre-fetch that already runs and costs no extra network call.
#
# These helpers shell out to `git` (against a caller-supplied repo path) rather
# than being purely functional, because the behaviour under test IS the git ref
# resolution. The tests drive them against throwaway repos in a temp directory,
# so they need only `git` -- no twig, no network -- and run on Linux CI.

# Deliberately does NOT Set-StrictMode: dot-sourcing propagates it into the
# caller's scope, which would change worktree-create.ps1's existing semantics.
# The functions below are written to be strict-safe so the test file can enable
# it for itself.

# ---------------------------------------------------------------------------
# Invoke git against a specific repo, capturing stdout and swallowing stderr.
# Returns the trimmed stdout, or $null when git exits non-zero.
#
# `git -C <path>` is used deliberately instead of `cd` -- see AGENTS.md
# "Command Patterns" (never `cd <dir> && <command>`).
# ---------------------------------------------------------------------------
function Invoke-GitCapture {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][string[]]$GitArgs
    )

    # Native-command stderr is promoted to a terminating error under
    # $ErrorActionPreference='Stop' (PS 5.1), so isolate it in a child scope.
    $output = & {
        $ErrorActionPreference = 'SilentlyContinue'
        & git -C $RepoPath @GitArgs 2>$null
    }
    $exit = $LASTEXITCODE

    if ($exit -ne 0) { return $null }
    if ($null -eq $output) { return '' }
    return ($output | Out-String).Trim()
}

# ---------------------------------------------------------------------------
# Resolve a ref to a full SHA, or $null when the ref does not exist.
# ---------------------------------------------------------------------------
function Get-RefSha {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][string]$Ref
    )

    $sha = Invoke-GitCapture -RepoPath $RepoPath -GitArgs @('rev-parse', '--verify', '--quiet', "$Ref^{commit}")
    if ([string]::IsNullOrWhiteSpace($sha)) { return $null }
    return $sha
}

# ---------------------------------------------------------------------------
# Does a local branch of this name already exist?
# ---------------------------------------------------------------------------
function Test-LocalBranch {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][string]$Branch
    )

    return $null -ne (Get-RefSha -RepoPath $RepoPath -Ref "refs/heads/$Branch")
}

# ---------------------------------------------------------------------------
# Decide which ref a new worktree branch should be cut from.
#
# Preference order:
#   1. refs/remotes/origin/<parent>  -- the pushed remote state (the fix)
#   2. refs/heads/<parent>           -- local fallback, flagged for the caller
#
# `-Parent none` means "register no twig dependency"; it is not a branch, so it
# resolves to main like the default does.
#
# Returns a PSCustomObject:
#   Parent      normalised parent branch name
#   Ref         the ref to branch from
#   Sha         its commit SHA ($null when nothing resolved)
#   Source      'remote' | 'local' | 'none'
#   LocalSha    SHA of the local branch of the same name ($null if absent)
#   IsStale     $true when Source is 'remote' AND the local branch of the same
#               name exists and points somewhere else -- i.e. exactly the
#               LS-9791 condition that used to produce a stale worktree
# ---------------------------------------------------------------------------
function Resolve-WorktreeBase {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [string]$Parent = 'main',
        [string]$Remote = 'origin'
    )

    $parentBranch = if ($Parent -eq 'none' -or [string]::IsNullOrWhiteSpace($Parent)) { 'main' } else { $Parent }

    $remoteRef = "refs/remotes/$Remote/$parentBranch"
    $remoteSha = Get-RefSha -RepoPath $RepoPath -Ref $remoteRef
    $localSha = Get-RefSha -RepoPath $RepoPath -Ref "refs/heads/$parentBranch"

    if ($remoteSha) {
        return [PSCustomObject]@{
            Parent   = $parentBranch
            Ref      = "$Remote/$parentBranch"
            Sha      = $remoteSha
            Source   = 'remote'
            LocalSha = $localSha
            IsStale  = ($null -ne $localSha -and $localSha -ne $remoteSha)
        }
    }

    if ($localSha) {
        return [PSCustomObject]@{
            Parent   = $parentBranch
            Ref      = $parentBranch
            Sha      = $localSha
            Source   = 'local'
            LocalSha = $localSha
            IsStale  = $false
        }
    }

    return [PSCustomObject]@{
        Parent   = $parentBranch
        Ref      = $null
        Sha      = $null
        Source   = 'none'
        LocalSha = $null
        IsStale  = $false
    }
}

# ---------------------------------------------------------------------------
# Create <Branch> at <BaseRef> so a subsequent `twig worktree create` adopts it
# ("Using existing branch: ...") instead of cutting a fresh one from local HEAD.
#
# Idempotent and non-destructive: an existing branch is NEVER moved -- doing so
# could silently discard committed work on a re-run or a name collision. The
# caller is told what happened and decides whether to warn.
#
# Returns a PSCustomObject:
#   Created         $true when this call created the branch
#   AlreadyExisted  $true when a local branch of that name was already present
#   Sha             the branch's SHA after the call
#   MatchesBase     $true when Sha equals the base SHA
# ---------------------------------------------------------------------------
function New-WorktreeBranchAtBase {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][string]$Branch,
        [Parameter(Mandatory = $true)][string]$BaseRef
    )

    $baseSha = Get-RefSha -RepoPath $RepoPath -Ref $BaseRef
    if (-not $baseSha) {
        throw "Base ref '$BaseRef' does not resolve to a commit in $RepoPath"
    }

    if (Test-LocalBranch -RepoPath $RepoPath -Branch $Branch) {
        $existingSha = Get-RefSha -RepoPath $RepoPath -Ref "refs/heads/$Branch"
        return [PSCustomObject]@{
            Created        = $false
            AlreadyExisted = $true
            Sha            = $existingSha
            MatchesBase    = ($existingSha -eq $baseSha)
        }
    }

    $null = Invoke-GitCapture -RepoPath $RepoPath -GitArgs @('branch', $Branch, $BaseRef)
    $newSha = Get-RefSha -RepoPath $RepoPath -Ref "refs/heads/$Branch"
    if (-not $newSha) {
        throw "Failed to create branch '$Branch' at '$BaseRef' in $RepoPath"
    }

    return [PSCustomObject]@{
        Created        = $true
        AlreadyExisted = $false
        Sha            = $newSha
        MatchesBase    = ($newSha -eq $baseSha)
    }
}
