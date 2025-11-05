#!/usr/bin/env bash
set -euo pipefail

# Squash all commits on current branch from its parent in the twig tree
#
# Usage: ./squash-branch.sh [-m "commit message"]

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

info() { echo -e "${CYAN}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }
warning() { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }

# Parse arguments
MESSAGE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--message)
            MESSAGE="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

info "🌳 Squashing branch commits..."

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ -z "$CURRENT_BRANCH" ]]; then
    error "❌ Not on a branch"
    exit 1
fi

info "Current branch: $CURRENT_BRANCH"

# Extract ticket number
TICKET=""
if [[ $CURRENT_BRANCH =~ ^([A-Z]+-[0-9]+) ]]; then
    TICKET="${BASH_REMATCH[1]}"
fi

# Get parent branch from twig
info "Getting parent branch from twig..."
TWIG_OUTPUT=$(twig tree 2>&1 || true)

# Parse twig tree output
PARENT_BRANCH=""
CURRENT_INDENT=""
FOUND_CURRENT=false

while IFS= read -r line; do
    if [[ $line =~ $CURRENT_BRANCH ]]; then
        FOUND_CURRENT=true
        CURRENT_INDENT="${line%%[^[:space:]]*}"
        continue
    fi
    
    if $FOUND_CURRENT && [[ $line =~ (LS-[0-9]+/[a-zA-Z0-9_-]+|main) ]]; then
        LINE_INDENT="${line%%[^[:space:]]*}"
        if [[ ${#LINE_INDENT} -lt ${#CURRENT_INDENT} ]]; then
            PARENT_BRANCH="${BASH_REMATCH[1]}"
            PARENT_BRANCH="${PARENT_BRANCH%% *}"
            break
        fi
    fi
done <<< "$TWIG_OUTPUT"

if [[ -z "$PARENT_BRANCH" ]]; then
    PARENT_BRANCH="main"
    warning "⚠️  Could not determine parent from twig tree, using 'main'"
else
    success "Parent branch: $PARENT_BRANCH"
fi

# Count commits
COMMIT_COUNT=$(git rev-list --count "$PARENT_BRANCH..HEAD")

if [[ $COMMIT_COUNT -le 1 ]]; then
    warning "⚠️  Only $COMMIT_COUNT commit(s) on branch, nothing to squash"
    exit 0
fi

info "Found $COMMIT_COUNT commits to squash"

# Show commits
info "\nRecent commits:"
git log --oneline "$PARENT_BRANCH..HEAD" | sed "s/^/  /" | while read -r line; do
    echo -e "${GRAY}$line${NC}"
done

# Generate commit message
if [[ -z "$MESSAGE" ]]; then
    # Extract meaningful descriptions from commits
    COMMITS=$(git log --format="%s" "$PARENT_BRANCH..HEAD")
    
    # Determine type
    TYPE="feat"
    if echo "$COMMITS" | grep -q "^fix("; then TYPE="fix"; fi
    if echo "$COMMITS" | grep -q "^refactor("; then TYPE="refactor"; fi
    if echo "$COMMITS" | grep -q "^perf("; then TYPE="perf"; fi
    
    # Extract scope from branch name
    SCOPE="branch"
    if [[ $CURRENT_BRANCH =~ LS-[0-9]+/(.+) ]]; then
        SCOPE="${BASH_REMATCH[1]}"
        SCOPE="${SCOPE//-/ }"
        SCOPE=$(echo "$SCOPE" | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
        SCOPE="${SCOPE// /-}"
    fi
    
    # Extract primary description
    PRIMARY_DESC=$(echo "$COMMITS" | head -1 | sed -E 's/^(feat|fix|refactor|perf|chore)(\([^)]+\))?:\s*//')
    
    MESSAGE="$TYPE($SCOPE): $PRIMARY_DESC"
fi

# Add ticket reference
if [[ -n "$TICKET" ]]; then
    MESSAGE="$MESSAGE ($TICKET)"
fi

info "\n📝 Squashing with commit message:"
success "  $MESSAGE"

# Confirm
echo ""
read -p "Continue with squash? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    warning "❌ Squash cancelled"
    exit 0
fi

# Perform squash
info "\n🔄 Performing squash..."

git reset --soft "$PARENT_BRANCH"
git commit -m "$MESSAGE"

success "\n✅ Successfully squashed $COMMIT_COUNT commits into 1!"
info "\nNew commit:"
git log -1 --oneline

info "\n💡 Next steps:"
warning "  1. Review the squashed commit: git log -1 --stat"
warning "  2. Force push to remote: git push origin HEAD --force-with-lease"
warning "  3. Rebase child branches: make rebase-tree"
