#!/bin/bash
# =============================================================================
# Devcontainer / Codespace — Post-Create Setup
# =============================================================================
# Mirrors copilot-setup-steps.yml for parity across cloud environments.
# Runs once when the container is created (not on restart).
# =============================================================================

set -euo pipefail

echo "=== Legacy Sports devcontainer setup ==="

# ---------------------------------------------------------------------------
# 1. Node.js + pnpm (corepack)
# ---------------------------------------------------------------------------
corepack enable
corepack prepare pnpm@9.12.1 --activate
echo "pnpm $(pnpm --version) activated"

# ---------------------------------------------------------------------------
# 2. Install dependencies
# ---------------------------------------------------------------------------
pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# 3. Git LFS
# ---------------------------------------------------------------------------
git lfs install
git lfs pull

# ---------------------------------------------------------------------------
# 4. Start PostgreSQL via Docker Compose
# ---------------------------------------------------------------------------
if command -v docker &>/dev/null; then
  docker compose up -d postgres

  echo "Waiting for PostgreSQL..."
  for i in $(seq 1 60); do
    if docker compose exec -T postgres pg_isready -U legacy_sports -d legacy_sports_dev >/dev/null 2>&1; then
      echo "PostgreSQL is ready (after ${i}s)"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "WARNING: PostgreSQL failed to start within 60s — skipping database setup"
      echo "=== Devcontainer setup complete (without database) ==="
      exit 0
    fi
    sleep 1
  done

  # ---------------------------------------------------------------------------
  # 5. Restore dev seed database
  # ---------------------------------------------------------------------------
  SEED_FILE="resources/dev-seed.dump"
  PG_CONTAINER="ls-postgres"
  PG_USER="legacy_sports"
  PG_DB="legacy_sports_dev"

  if [ -f "$SEED_FILE" ] && [ "$(stat -c%s "$SEED_FILE" 2>/dev/null || echo 0)" -gt 1000 ]; then
    docker cp "$SEED_FILE" "${PG_CONTAINER}:/tmp/restore.dump"

    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS $PG_DB;"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "CREATE SCHEMA IF NOT EXISTS app_internal;"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "GRANT ALL PRIVILEGES ON SCHEMA public TO $PG_USER;"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "GRANT ALL PRIVILEGES ON SCHEMA app_internal TO $PG_USER;"

    docker exec "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges --clean --if-exists /tmp/restore.dump || true
    echo "Dev seed restored"
  else
    echo "WARNING: $SEED_FILE missing or is an LFS pointer — run 'git lfs pull' manually"
  fi

  # ---------------------------------------------------------------------------
  # 6. Apply database migrations
  # ---------------------------------------------------------------------------
  pnpm --prefix lib/db-client run db:migrate || echo "WARNING: migrations failed"
else
  echo "WARNING: Docker not available — skipping database setup"
fi

# ---------------------------------------------------------------------------
# 7. Create .env for MCP servers
# ---------------------------------------------------------------------------
if [ ! -f .env ]; then
  cat >.env <<'EOF'
USE_LOCAL_CREDENTIALS=true
DB_HOST=localhost:5432
DB_USER=legacy_sports
DB_PASSWORD=legacy_sports_dev
DB_NAME=legacy_sports_dev
DATABASE_URL=postgresql://legacy_sports:legacy_sports_dev@localhost:5432/legacy_sports_dev
DB_CERT_PATH=
DB_SECRET_NAME=
JWT_SECRET=cloud-agent-jwt-secret-not-for-production
COOKIE_SECRET=cloud-agent-cookie-secret-not-for-production
EOF
  echo ".env created for MCP servers"
fi

echo "=== Devcontainer setup complete ==="
