#!/usr/bin/env bash
# Starts a throwaway local Postgres + GraphQL dev server, seeds adversarial
# personas, then runs the adversarial-qa scenario suite against it.
#
# This is NOT the project's normal dev stack (`make dev-db`) — it is a
# disposable sandbox scoped to this harness:
#   - its own role/database (legacy_sports / legacy_sports_dev on localhost)
#   - lambdas/db/src/dev.ts, the *unsigned-JWT* standalone server (never the
#     real signature-checked server), so it must never be reachable from
#     anywhere but localhost
#
# Usage:
#   scripts/adversarial-qa/start-local-stack.sh [scenario-name ...]
#   (with no args, runs every scenario under scripts/adversarial-qa/scenarios/)
#
# Idempotent: safe to re-run — skips steps that already succeeded.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
REPO_ROOT="$(pwd)"
LOG_DIR="$REPO_ROOT/scripts/adversarial-qa/.run"
mkdir -p "$LOG_DIR"

DB_ROLE=legacy_sports
DB_PASS=legacy_sports_dev
DB_NAME=legacy_sports_dev

export DB_HOST=localhost
export DB_USER="$DB_ROLE"
export DB_PASSWORD="$DB_PASS"
export DB_NAME
export USE_LOCAL_CREDENTIALS=true
export USE_LOCAL_CREDS=true
export DATABASE_URL="postgresql://${DB_ROLE}:${DB_PASS}@localhost:5432/${DB_NAME}"
export JWT_SECRET=dev-jwt-secret-not-for-production
export COOKIE_SECRET=dev-cookie-secret-not-for-production
export NODE_ENV=development
export ADVERSARIAL_QA_GRAPHQL_URL="http://localhost:5000/"

echo "==> Starting local Postgres"
service postgresql start >/dev/null 2>&1 || true
for _ in 1 2 3 4 5; do
  pg_isready -h localhost >/dev/null 2>&1 && break
  sleep 1
done

echo "==> Ensuring role/database exist"
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_ROLE}'\"" 2>/dev/null | grep -q 1 \
  || su postgres -c "psql -c \"CREATE ROLE ${DB_ROLE} LOGIN SUPERUSER PASSWORD '${DB_PASS}';\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" 2>/dev/null | grep -q 1 \
  || su postgres -c "psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_ROLE};\""

echo "==> Applying migrations (idempotent — only applies what's missing)"
pnpm --prefix lib/db-client run db:up >"$LOG_DIR/migrate.log" 2>&1 || {
  echo "Migration failed — see $LOG_DIR/migrate.log"; exit 1;
}

echo "==> Starting GraphQL dev server (lambdas/db/src/dev.ts) on :5000"
if ! curl -sf -X POST localhost:5000/ -H 'content-type: application/json' \
    -d '{"query":"{ __typename }"}' >/dev/null 2>&1; then
  ( cd lambdas/db && nohup "$REPO_ROOT/node_modules/.bin/tsx" \
      --tsconfig "$REPO_ROOT/tsconfig.base.json" src/dev.ts \
      >"$LOG_DIR/graphql.log" 2>&1 & echo $! >"$LOG_DIR/graphql.pid" )
  for _ in $(seq 1 30); do
    curl -sf -X POST localhost:5000/ -H 'content-type: application/json' \
      -d '{"query":"{ __typename }"}' >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "==> Seeding adversarial personas"
node scripts/adversarial-qa/seed-personas.mjs

echo "==> Running scenarios"
node scripts/adversarial-qa/run.mjs "$@"
