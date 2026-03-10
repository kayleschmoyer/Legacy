#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Remove the temporary PR body file after a PR has been created.
.DESCRIPTION
    Deletes .github/tmp-pr-body.md from the current directory (or from a
    specified worktree path) so it is not left behind after `gh pr create`.
.PARAMETER Path
    Optional path to the worktree root. Defaults to the current directory.
.EXAMPLE
    .\scripts\cleanup-pr-body.ps1
.EXAMPLE
    .\scripts\cleanup-pr-body.ps1 -Path "D:\code\legacy-sports-worktrees\LS-930-my-ticket"
#>
param(
    [string]$Path = (Get-Location).Path
)

$target = Join-Path $Path ".github\tmp-pr-body.md"

if (Test-Path $target) {
    Remove-Item $target -Force
    Write-Host "Removed $target"
} else {
    Write-Host "Nothing to clean up ($target not found)"
}
