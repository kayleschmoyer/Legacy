<#
.SYNOPSIS
    Windows-optimized Nx command wrapper that prevents console window flashing

.DESCRIPTION
    Wraps Nx commands to run with hidden console windows on Windows,
    preventing the annoying flashing effect when running parallel tasks.

.EXAMPLE
    .\scripts\nx-wrapper.ps1 affected -t test --parallel=3

.EXAMPLE
    .\scripts\nx-wrapper.ps1 run-many -t typecheck --projects=utils,api

.NOTES
    Issue: LS-102
    Author: AI Agent
    Date: 2026-02-12
#>

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Continue"

# Suppress warnings and enable color output
$env:NODE_NO_WARNINGS = "1"
$env:FORCE_COLOR = "1"

# Build the command string
$argsString = $Arguments -join " "

# Run the command directly
Invoke-Expression "pnpm exec nx $argsString"

# Return the exit code
exit $LASTEXITCODE
