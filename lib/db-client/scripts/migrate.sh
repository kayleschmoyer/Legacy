#!/bin/bash
# Database Migration Script for Legacy Sports
# This script runs Drizzle migrations for both public and internal schemas

set -e

# Default values
ENVIRONMENT="dev"
DRY_RUN=false
FORCE=false
PUBLIC_ONLY=false
INTERNAL_ONLY=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
info() { echo -e "${CYAN}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }
warning() { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }

# Help function
show_help() {
    cat << EOF
Legacy Sports Database Migration Script

USAGE:
    ./scripts/migrate.sh [OPTIONS]

OPTIONS:
    -e, --environment <env>    Environment to migrate (default: dev)
    -d, --dry-run             Show what would be migrated without executing
    -f, --force               Skip confirmation prompts
    -p, --public-only         Only migrate public schema
    -i, --internal-only       Only migrate internal schema
    -h, --help                Show this help message

EXAMPLES:
    ./scripts/migrate.sh                    # Migrate both schemas with confirmation
    ./scripts/migrate.sh --dry-run         # Show planned migrations
    ./scripts/migrate.sh --force           # Skip confirmations
    ./scripts/migrate.sh --public-only     # Only migrate public schema

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -p|--public-only)
            PUBLIC_ONLY=true
            shift
            ;;
        -i|--internal-only)
            INTERNAL_ONLY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

info "Legacy Sports Database Migration"
info "================================="
echo ""

# Check if we're in the correct directory
if [[ ! -f "package.json" ]]; then
    error "package.json not found. Please run this script from the db-client directory."
    exit 1
fi

# Check if environment file exists
ENV_FILE="../../.env"
if [[ ! -f "$ENV_FILE" ]]; then
    error ".env file not found at $ENV_FILE. Please run the sync-env script first."
    exit 1
fi

# Check database configuration
info "Checking database configuration..."
if ! grep -q "^DB_HOST=" "$ENV_FILE" || ! grep -q "^DB_USER=" "$ENV_FILE"; then
    error "Database configuration incomplete. Please ensure DB_HOST and DB_USER are set in .env"
    exit 1
fi

DB_HOST=$(grep "^DB_HOST=" "$ENV_FILE" | cut -d'=' -f2-)
DB_USER=$(grep "^DB_USER=" "$ENV_FILE" | cut -d'=' -f2-)

success "✓ Database configuration found"
echo -e "  Host: ${NC}$DB_HOST"
echo -e "  User: ${NC}$DB_USER"
echo ""

# Determine which schemas to migrate
MIGRATE_PUBLIC=true
MIGRATE_INTERNAL=true

if [[ "$PUBLIC_ONLY" == true ]]; then
    MIGRATE_INTERNAL=false
    info "Migration scope: Public schema only"
elif [[ "$INTERNAL_ONLY" == true ]]; then
    MIGRATE_PUBLIC=false
    info "Migration scope: Internal schema only"
else
    info "Migration scope: Both public and internal schemas"
fi

# Check for pending migrations
info "Checking for pending migrations..."

PUBLIC_COUNT=0
INTERNAL_COUNT=0

if [[ "$MIGRATE_PUBLIC" == true ]] && [[ -d "src/drizzle/migrations/public" ]]; then
    PUBLIC_COUNT=$(find src/drizzle/migrations/public -name "*.sql" | wc -l)
    echo "  Public schema: $PUBLIC_COUNT migration(s) found"
fi

if [[ "$MIGRATE_INTERNAL" == true ]] && [[ -d "src/drizzle/migrations/internal" ]]; then
    INTERNAL_COUNT=$(find src/drizzle/migrations/internal -name "*.sql" | wc -l)
    echo "  Internal schema: $INTERNAL_COUNT migration(s) found"
fi

if [[ $PUBLIC_COUNT -eq 0 ]] && [[ $INTERNAL_COUNT -eq 0 ]]; then
    warning "No migrations found to execute."
    exit 0
fi

echo ""

# Show what will be migrated
if [[ "$DRY_RUN" == true ]]; then
    info "DRY RUN - The following migrations would be executed:"
    echo ""
    
    if [[ "$MIGRATE_PUBLIC" == true ]] && [[ $PUBLIC_COUNT -gt 0 ]]; then
        warning "Public Schema Migrations:"
        find src/drizzle/migrations/public -name "*.sql" | sort | while read -r file; do
            echo "  • $(basename "$file")"
        done
        echo ""
    fi
    
    if [[ "$MIGRATE_INTERNAL" == true ]] && [[ $INTERNAL_COUNT -gt 0 ]]; then
        warning "Internal Schema Migrations:"
        find src/drizzle/migrations/internal -name "*.sql" | sort | while read -r file; do
            echo "  • $(basename "$file")"
        done
        echo ""
    fi
    
    info "To execute these migrations, run the script without --dry-run"
    exit 0
fi

# Confirmation unless forced
if [[ "$FORCE" != true ]]; then
    warning "This will execute database migrations. This action cannot be undone."
    echo ""
    if [[ "$MIGRATE_PUBLIC" == true ]] && [[ $PUBLIC_COUNT -gt 0 ]]; then
        echo -e "${YELLOW}Public schema migrations to execute: $PUBLIC_COUNT${NC}"
    fi
    if [[ "$MIGRATE_INTERNAL" == true ]] && [[ $INTERNAL_COUNT -gt 0 ]]; then
        echo -e "${YELLOW}Internal schema migrations to execute: $INTERNAL_COUNT${NC}"
    fi
    echo ""
    
    read -p "Are you sure you want to proceed? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Migration cancelled."
        exit 0
    fi
fi

echo ""
info "Starting database migration..."

# Execute migrations
SUCCESS=true

# Migrate public schema
if [[ "$MIGRATE_PUBLIC" == true ]] && [[ $PUBLIC_COUNT -gt 0 ]]; then
    info "Migrating public schema..."
    if npm run migrate:public; then
        success "✓ Public schema migration completed"
        echo ""
    else
        error "Public schema migration failed"
        SUCCESS=false
    fi
fi

# Migrate internal schema
if [[ "$MIGRATE_INTERNAL" == true ]] && [[ $INTERNAL_COUNT -gt 0 ]] && [[ "$SUCCESS" == true ]]; then
    info "Migrating internal schema..."
    if npm run migrate:internal; then
        success "✓ Internal schema migration completed"
        echo ""
    else
        error "Internal schema migration failed"
        SUCCESS=false
    fi
fi

# Summary
echo ""
if [[ "$SUCCESS" == true ]]; then
    success "================================="
    success "Migration completed successfully!"
    success "================================="
    
    if [[ "$MIGRATE_PUBLIC" == true ]] && [[ $PUBLIC_COUNT -gt 0 ]]; then
        success "✓ Public schema: $PUBLIC_COUNT migration(s) applied"
    fi
    if [[ "$MIGRATE_INTERNAL" == true ]] && [[ $INTERNAL_COUNT -gt 0 ]]; then
        success "✓ Internal schema: $INTERNAL_COUNT migration(s) applied"
    fi
    
    echo ""
    info "Next steps:"
    echo "• Verify the migration with: npm run studio:public or npm run studio:internal"
    echo "• Test your application to ensure everything works correctly"
    
else
    error "================================="
    error "Migration failed!"
    error "================================="
    echo ""
    warning "Please check the error messages above and fix any issues before retrying."
    exit 1
fi
