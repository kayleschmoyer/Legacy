#!/bin/bash

# Legacy Sports Database Migration Script
# =====================================
#
# This script runs the database migrations for both public and internal schemas.
# It automatically switches to the direct database endpoint for migrations and
# can optionally switch back to the proxy endpoint for runtime.
#
# Usage:
#   ./run-migrations.sh [options]
#
# Options:
#   --skip-public      Skip running public schema migrations
#   --skip-internal    Skip running internal schema migrations
#   --stay-on-direct   Don't switch back to proxy endpoint after migrations
#   --dry-run          Show what would be migrated without actually running migrations
#   --help             Show this help message
#
# Examples:
#   ./run-migrations.sh
#   ./run-migrations.sh --skip-internal --stay-on-direct
#   ./run-migrations.sh --dry-run

set -e

# Parse command line arguments
SKIP_PUBLIC=false
SKIP_INTERNAL=false
STAY_ON_DIRECT=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-public)
            SKIP_PUBLIC=true
            shift
            ;;
        --skip-internal)
            SKIP_INTERNAL=true
            shift
            ;;
        --stay-on-direct)
            STAY_ON_DIRECT=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Legacy Sports Database Migration Script"
            echo "======================================"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-public      Skip running public schema migrations"
            echo "  --skip-internal    Skip running internal schema migrations"
            echo "  --stay-on-direct   Don't switch back to proxy endpoint after migrations"
            echo "  --dry-run          Show what would be migrated without actually running migrations"
            echo "  --help             Show this help message"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}Legacy Sports Database Migration Script${NC}"
echo -e "${CYAN}=======================================${NC}"
echo ""

# Get script directory and change to root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo -e "${GRAY}Working directory: $ROOT_DIR${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN MODE - No actual migrations will be performed${NC}"
    echo ""
fi

# Step 1: Switch to direct database endpoint for migrations
echo -e "${GREEN}Step 1: Configuring environment for migrations...${NC}"
if ! ./scripts/sync-env.sh direct; then
    echo -e "${RED}Failed to configure environment${NC}"
    exit 1
fi
echo ""

# Step 2: Navigate to db-client
echo -e "${GREEN}Step 2: Navigating to db-client directory...${NC}"
cd "lib/db-client"

# Step 3: Test database connectivity
echo -e "${GREEN}Step 3: Testing database connectivity...${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}SKIPPED (dry run)${NC}"
else
    if node -e "
        require('dotenv').config({ path: '../../.env' });
        const { Pool } = require('pg');
        
        const config = {
            host: process.env.DB_HOST.replace(':5432', ''),
            port: 5432,
            database: 'postgres',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: false }
        };
        
        const pool = new Pool(config);
        pool.connect()
            .then(client => {
                console.log('SUCCESS');
                client.release();
                pool.end();
            })
            .catch(err => {
                console.error('FAILED:', err.message);
                process.exit(1);
            });
    " 2>/dev/null | grep -q "SUCCESS"; then
        echo -e "${GREEN}✅ Database connection successful${NC}"
    else
        echo -e "${RED}❌ Database connectivity test failed${NC}"
        exit 1
    fi
fi
echo ""

# Step 4: Run migrations
echo -e "${GREEN}Step 4: Running database migrations...${NC}"

MIGRATION_SUCCESS=true

if [ "$SKIP_PUBLIC" = false ]; then
    echo -e "${CYAN}  Running public schema migrations...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  SKIPPED (dry run)${NC}"
    else
        if npm run migrate:public; then
            echo -e "${GREEN}  ✅ Public schema migrations completed${NC}"
        else
            echo -e "${RED}  ❌ Public schema migrations failed${NC}"
            MIGRATION_SUCCESS=false
        fi
    fi
    echo ""
fi

if [ "$SKIP_INTERNAL" = false ]; then
    echo -e "${CYAN}  Running internal schema migrations...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}  SKIPPED (dry run)${NC}"
    else
        if npm run migrate:internal; then
            echo -e "${GREEN}  ✅ Internal schema migrations completed${NC}"
        else
            echo -e "${RED}  ❌ Internal schema migrations failed${NC}"
            MIGRATION_SUCCESS=false
        fi
    fi
    echo ""
fi

# Step 5: Switch back to proxy endpoint (optional)
if [ "$STAY_ON_DIRECT" = false ] && [ "$MIGRATION_SUCCESS" = true ]; then
    echo -e "${GREEN}Step 5: Switching back to proxy endpoint for runtime...${NC}"
    cd "$ROOT_DIR"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}SKIPPED (dry run)${NC}"
    else
        if ! ./scripts/sync-env.sh proxy; then
            echo -e "${YELLOW}Warning: Failed to switch back to proxy endpoint${NC}"
        fi
    fi
    echo ""
fi

# Summary
echo -e "${CYAN}Migration Summary:${NC}"
echo -e "${CYAN}=================${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${GREEN}✓ Dry run completed successfully${NC}"
    echo -e "${GRAY}• Public migrations: $([ "$SKIP_PUBLIC" = true ] && echo "Skipped" || echo "Would run")${NC}"
    echo -e "${GRAY}• Internal migrations: $([ "$SKIP_INTERNAL" = true ] && echo "Skipped" || echo "Would run")${NC}"
    echo -e "${GRAY}• Endpoint after: $([ "$STAY_ON_DIRECT" = true ] && echo "Direct" || echo "Proxy")${NC}"
elif [ "$MIGRATION_SUCCESS" = true ]; then
    echo -e "${GREEN}✅ All migrations completed successfully!${NC}"
    echo -e "${GREEN}• Public migrations: $([ "$SKIP_PUBLIC" = true ] && echo "Skipped" || echo "Completed")${NC}"
    echo -e "${GREEN}• Internal migrations: $([ "$SKIP_INTERNAL" = true ] && echo "Skipped" || echo "Completed")${NC}"
    echo -e "${GREEN}• Current endpoint: $([ "$STAY_ON_DIRECT" = true ] && echo "Direct (for migrations)" || echo "Proxy (for runtime)")${NC}"
else
    echo -e "${RED}❌ Some migrations failed!${NC}"
    echo -e "${RED}Please check the errors above and resolve issues before proceeding.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Notes:${NC}"
echo -e "${YELLOW}• Use --stay-on-direct if you need to run more migrations${NC}"
echo -e "${YELLOW}• Use --dry-run to test without making changes${NC}"
echo -e "${YELLOW}• Proxy endpoint is recommended for runtime (Lambda functions)${NC}"
echo -e "${YELLOW}• Direct endpoint is required for migrations and public access${NC}"
