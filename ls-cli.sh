#!/usr/bin/env bash
# Legacy Sports CLI Entrypoint
# Simple wrapper to run the CLI application
# 
# Usage:
#   ./ls-cli.sh --help
#   ./ls-cli.sh test-connection
#   ./ls-cli.sh query-db --query "SELECT * FROM players LIMIT 10"
#   ./ls-cli.sh get-player-batting --player troutmi01

set -e
cd "$(dirname "$0")/apps/cli"
pnpm exec tsx --tsconfig ../../tsconfig.base.json src/main.ts "$@"
