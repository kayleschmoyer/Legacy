#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Plain-PowerShell assertions for the base-ref helpers in
    scripts/lib/worktree-base.ps1 (Resolve-WorktreeBase, New-WorktreeBranchAtBase).
.DESCRIPTION
    Regression coverage for LS-9791: `make worktree` created branches from the
    LOCAL main ref, so a worktree opened while local main was behind
    origin/main started stale -- files merged in the gap were silently absent.

    Intentionally Pester-free, matching jira-rollup.test.ps1: the only
    PowerShell on most dev machines ships Pester 3 (whose syntax differs from
    Pester 5). This script dot-sources the helpers and exits non-zero on the
    first failure, so it works on any PowerShell with no module install.

    Drives the helpers against throwaway git repos under a temp directory:
    real `git` ref resolution is the behaviour under test, and using real repos
    is what makes this a genuine regression test rather than a mock. Needs only
    `git` -- no twig, no network -- so it runs on Linux CI.

    Run: pnpm run test:scripts:ps
    Or:  pwsh -File scripts/__tests__/worktree-base.test.ps1
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "../lib/worktree-base.ps1")

$script:failures = 0

function Assert-Equal {
    param($Actual, $Expected, [string]$Name)
    $a = (@($Actual) -join '|')
    $e = (@($Expected) -join '|')
    if ($a -ne $e) {
        Write-Host "FAIL  $Name : got '$a', want '$e'" -ForegroundColor Red
        $script:failures++
    } else {
        Write-Host "ok    $Name" -ForegroundColor Green
    }
}

# ---------------------------------------------------------------------------
# Fixture: an "upstream" repo plus a clone whose local main has been rewound,
# reproducing the LS-9791 condition exactly (local main behind origin/main,
# with origin/main already fetched and current).
#
#   upstream main : c1 -> c2 (c2 adds newfile.txt)
#   clone   main  : c1              <- rewound
#   clone   origin/main : c2        <- current
# ---------------------------------------------------------------------------
function Invoke-Git {
    param([string]$RepoPath, [string[]]$GitArgs)
    $out = & {
        $ErrorActionPreference = 'SilentlyContinue'
        & git -C $RepoPath @GitArgs 2>$null
    }
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed in $RepoPath (exit $LASTEXITCODE)"
    }
    return ($out | Out-String).Trim()
}

function New-Fixture {
    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("ls9791-" + [System.Guid]::NewGuid().ToString('N').Substring(0, 12))
    $upstream = Join-Path $root 'upstream'
    New-Item -ItemType Directory -Path $upstream -Force | Out-Null

    $null = Invoke-Git $upstream @('init', '--quiet')
    $null = Invoke-Git $upstream @('config', 'user.email', 'test@example.com')
    $null = Invoke-Git $upstream @('config', 'user.name', 'Test')
    # Pin the initial branch name: `git init` honours init.defaultBranch, which
    # varies by machine, and every assertion below is keyed to 'main'.
    $null = Invoke-Git $upstream @('symbolic-ref', 'HEAD', 'refs/heads/main')

    Set-Content -Path (Join-Path $upstream 'a.txt') -Value 'one'
    $null = Invoke-Git $upstream @('add', '-A')
    $null = Invoke-Git $upstream @('commit', '--quiet', '-m', 'c1')
    $c1 = Invoke-Git $upstream @('rev-parse', 'HEAD')

    # c2 adds a file: standing in for "the PR that just merged".
    Set-Content -Path (Join-Path $upstream 'newfile.txt') -Value 'two'
    $null = Invoke-Git $upstream @('add', '-A')
    $null = Invoke-Git $upstream @('commit', '--quiet', '-m', 'c2 adds newfile')
    $c2 = Invoke-Git $upstream @('rev-parse', 'HEAD')

    # A pushed stacked parent, branched off c2 and carrying its own commit.
    # The commit is made ON the parent branch, leaving main at c2 -- the stacked
    # assertions below depend on origin/main and origin/LS-1/parent differing.
    $null = Invoke-Git $upstream @('checkout', '--quiet', '-b', 'LS-1/parent', $c2)
    Set-Content -Path (Join-Path $upstream 'parent.txt') -Value 'p'
    $null = Invoke-Git $upstream @('add', '-A')
    $null = Invoke-Git $upstream @('commit', '--quiet', '-m', 'parent-only commit')
    $null = Invoke-Git $upstream @('checkout', '--quiet', 'main')

    $clone = Join-Path $root 'clone'
    $null = Invoke-Git $root @('clone', '--quiet', $upstream, $clone)
    $null = Invoke-Git $clone @('config', 'user.email', 'test@example.com')
    $null = Invoke-Git $clone @('config', 'user.name', 'Test')
    # Rewind LOCAL main to c1 while origin/main stays at c2 -- the bug's setup.
    $null = Invoke-Git $clone @('reset', '--quiet', '--hard', $c1)

    $parentSha = Invoke-Git $clone @('rev-parse', 'refs/remotes/origin/LS-1/parent')

    return [PSCustomObject]@{
        Root      = $root
        Clone     = $clone
        C1        = $c1
        C2        = $c2
        ParentSha = $parentSha
    }
}

function Remove-Fixture {
    param([string]$Root)
    # Git marks objects read-only on some platforms; -Force clears that.
    Remove-Item -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue
}

$fx = New-Fixture
try {
    # --- Sanity: the fixture really is in the LS-9791 state ---
    $localMain = Invoke-Git $fx.Clone @('rev-parse', 'refs/heads/main')
    $originMain = Invoke-Git $fx.Clone @('rev-parse', 'refs/remotes/origin/main')
    Assert-Equal $localMain $fx.C1 "fixture: local main is behind (at c1)"
    Assert-Equal $originMain $fx.C2 "fixture: origin/main is current (at c2)"

    # --- Resolve-WorktreeBase: prefers origin/<parent> over the local ref ---
    # This is the whole fix. Before LS-9791 the base was local main (c1).
    $base = Resolve-WorktreeBase -RepoPath $fx.Clone -Parent 'main'
    Assert-Equal $base.Source 'remote' "default parent resolves to the remote-tracking ref"
    Assert-Equal $base.Ref 'origin/main' "default parent ref is origin/main"
    Assert-Equal $base.Sha $fx.C2 "base SHA is origin/main (c2), NOT local main (c1)"
    Assert-Equal $base.IsStale $true "stale local main is reported as stale"
    Assert-Equal ($base.Sha -ne $fx.C1) $true "regression: base is never the stale local main"

    # --- -Parent none is not a branch; it resolves to main like the default ---
    $noneBase = Resolve-WorktreeBase -RepoPath $fx.Clone -Parent 'none'
    Assert-Equal $noneBase.Parent 'main' "'none' parent normalises to main"
    Assert-Equal $noneBase.Sha $fx.C2 "'none' parent still bases off origin/main"

    # --- Stacked PARENT= path gets the same treatment ---
    $stacked = Resolve-WorktreeBase -RepoPath $fx.Clone -Parent 'LS-1/parent'
    Assert-Equal $stacked.Source 'remote' "stacked parent resolves to the remote-tracking ref"
    Assert-Equal $stacked.Ref 'origin/LS-1/parent' "stacked parent ref is origin/<parent>"
    Assert-Equal $stacked.Sha $fx.ParentSha "stacked child bases off the PUSHED parent"

    # --- Unknown parent reports 'none' so the caller can fail loudly ---
    $missing = Resolve-WorktreeBase -RepoPath $fx.Clone -Parent 'LS-404/does-not-exist'
    Assert-Equal $missing.Source 'none' "unresolvable parent reports Source='none'"
    Assert-Equal $missing.Sha $null "unresolvable parent has no SHA"

    # --- Local-only fallback when the remote-tracking ref is absent ---
    $null = Invoke-Git $fx.Clone @('branch', 'local-only', $fx.C1)
    $localOnly = Resolve-WorktreeBase -RepoPath $fx.Clone -Parent 'local-only'
    Assert-Equal $localOnly.Source 'local' "local-only parent falls back to the local ref"
    Assert-Equal $localOnly.Sha $fx.C1 "local-only fallback uses the local SHA"
    Assert-Equal $localOnly.IsStale $false "local fallback is not flagged stale"

    # --- New-WorktreeBranchAtBase: the branch lands on origin/main, not local main ---
    $created = New-WorktreeBranchAtBase -RepoPath $fx.Clone -Branch 'LS-9791/fix' -BaseRef $base.Ref
    Assert-Equal $created.Created $true "new branch is created"
    Assert-Equal $created.AlreadyExisted $false "new branch did not already exist"
    Assert-Equal $created.Sha $fx.C2 "created branch points at origin/main (c2)"
    Assert-Equal $created.MatchesBase $true "created branch matches the base"

    # The end-to-end guarantee the ticket asks for: a worktree cut from this
    # branch contains the file that merged in the stale gap.
    $treeFiles = Invoke-Git $fx.Clone @('ls-tree', '--name-only', 'LS-9791/fix')
    Assert-Equal ($treeFiles -split '\r?\n' -contains 'newfile.txt') $true "branch contains the just-merged file (the reported symptom)"

    # --- Idempotent + non-destructive: an existing branch is never moved ---
    $null = Invoke-Git $fx.Clone @('branch', 'LS-9791/existing', $fx.C1)
    $existing = New-WorktreeBranchAtBase -RepoPath $fx.Clone -Branch 'LS-9791/existing' -BaseRef $base.Ref
    Assert-Equal $existing.Created $false "existing branch is not recreated"
    Assert-Equal $existing.AlreadyExisted $true "existing branch is reported as pre-existing"
    Assert-Equal $existing.Sha $fx.C1 "existing branch is NOT moved (would discard work)"
    Assert-Equal $existing.MatchesBase $false "existing branch is reported as off-base"

    # --- A bad base ref throws rather than silently creating a wrong branch ---
    $threw = $false
    try {
        $null = New-WorktreeBranchAtBase -RepoPath $fx.Clone -Branch 'LS-9791/bad' -BaseRef 'origin/nope'
    } catch {
        $threw = $true
    }
    Assert-Equal $threw $true "unresolvable base ref throws"
    Assert-Equal (Test-LocalBranch -RepoPath $fx.Clone -Branch 'LS-9791/bad') $false "no branch is created from a bad base"
}
finally {
    Remove-Fixture -Root $fx.Root
}

if ($script:failures -gt 0) {
    Write-Host "`n$($script:failures) assertion(s) FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "`nAll worktree base-ref assertions passed" -ForegroundColor Green
exit 0
