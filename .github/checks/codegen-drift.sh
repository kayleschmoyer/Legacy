#!/usr/bin/env bash
set -euo pipefail

# Drift check for generated GraphQL client files (LS-9549). lambdas/db/schema.graphql
# is the single source of truth; the graphql.generated.ts clients under apps/cli,
# lib/api, lib/bref-client, lib/data-loaders, and lib/graphql are produced by
# `make codegen` (pnpm exec nx run-many -t codegen) and must be regenerated +
# committed whenever the schema changes. Without this check, committed codegen
# output can drift silently from the schema (as it did for PublicLeagueInfo.sport).
echo "Checking GraphQL codegen drift..."
GRAPHQL_SCHEMA="$(pwd)/lambdas/db/schema.graphql" pnpm exec nx run-many -t codegen
git diff --exit-code -- '**/graphql.generated.ts'
echo "GraphQL codegen drift check passed"
