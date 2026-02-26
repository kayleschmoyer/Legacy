#!/usr/bin/env pwsh
# Legacy Sports CLI Entrypoint
# Simple wrapper to run the CLI application
# 
# Usage:
#   .\ls-cli.ps1 --help
#   .\ls-cli.ps1 test-connection
#   .\ls-cli.ps1 query-db --query "SELECT * FROM players LIMIT 10"
#   .\ls-cli.ps1 get-player-batting --player troutmi01

$ErrorActionPreference = "Stop"

# Store the original working directory so log files can be resolved correctly
$env:CLI_INVOKE_DIR = $PWD.Path

Push-Location "$PSScriptRoot/apps/cli"
try {
    # Increase the Node.js heap limit to 4 GB to prevent OOM errors when processing
    # large player sets (the bref HTML cache can accumulate significant memory).
    $env:NODE_OPTIONS = "--max-old-space-size=4096"
    & pnpm exec tsx --tsconfig ../../tsconfig.base.json src/main.ts @args
} finally {
    Pop-Location
}
