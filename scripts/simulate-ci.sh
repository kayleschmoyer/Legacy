#!/bin/bash

# Local CI Simulation Script
# Simulates the improved CI pipeline locally for debugging and testing
# Usage: ./simulate-ci.sh [--verbose] [--stage=<stage>]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default options
VERBOSE=false
SPECIFIC_STAGE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --stage=*)
            SPECIFIC_STAGE="${1#*=}"
            shift
            ;;
        --help)
            echo "Usage: $0 [--verbose] [--stage=<stage>]"
            echo ""
            echo "Options:"
            echo "  --verbose          Enable verbose output"
            echo "  --stage=<stage>    Run only specific stage (setup|quality|test|build|deploy)"
            echo "  --help             Show this help message"
            echo ""
            echo "Stages:"
            echo "  setup     Environment setup and dependency installation"
            echo "  quality   Code quality checks (format, lint, typecheck)"
            echo "  test      Unit and integration tests"
            echo "  build     Build validation for all platforms"
            echo "  deploy    Deployment readiness checks"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Setup CI-like environment
export NX_DAEMON=false
export NX_PARALLEL=4
export NX_CACHE_DIRECTORY=.nx-cache
export NX_SKIP_NX_CACHE=false
export NODE_OPTIONS="--max_old_space_size=4096"

if [ "$VERBOSE" = true ]; then
    export NX_VERBOSE_LOGGING=true
    export DEBUG=nx:*
fi

echo -e "${BLUE}🚀 Legacy Sports CI Pipeline Simulation${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "This script simulates the improved CI pipeline locally."
echo "Environment configured to match GitHub Actions runners."
echo ""

# Function to run a stage
run_stage() {
    local stage_name=$1
    local stage_id=$2
    shift 2
    
    if [[ -n "$SPECIFIC_STAGE" && "$SPECIFIC_STAGE" != "$stage_id" ]]; then
        return 0
    fi
    
    echo -e "${CYAN}🔄 Stage: $stage_name${NC}"
    echo "----------------------------------------"
    
    local start_time=$(date +%s)
    
    if "$@"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✅ $stage_name completed successfully (${duration}s)${NC}"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}❌ $stage_name failed after ${duration}s${NC}"
        echo ""
        echo -e "${YELLOW}💡 Debugging Tips:${NC}"
        echo "• Check the error output above"
        echo "• Run individual commands to isolate the issue"
        echo "• Ensure all dependencies are installed"
        echo "• Check for environment-specific issues"
        exit 1
    fi
    echo ""
}

# Function for environment setup
setup_environment() {
    echo -e "${CYAN}📦 Installing dependencies...${NC}"
    
    # Check Node.js version
    node_version=$(node --version)
    echo "Node.js version: $node_version"
    
    if ! npm ci --prefer-offline --no-audit; then
        echo -e "${RED}❌ Dependency installation failed${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
    return 0
}

# Function for detecting changes
detect_changes() {
    echo -e "${CYAN}🔍 Detecting changed files...${NC}"
    
    # Check if we're on a feature branch
    current_branch=$(git branch --show-current)
    if [ "$current_branch" = "main" ]; then
        echo -e "${YELLOW}⚠️  Running on main branch - will check all projects${NC}"
        echo "web=true" > .ci-changes
        echo "mobile=true" >> .ci-changes
        echo "lambdas=true" >> .ci-changes
        echo "terraform=true" >> .ci-changes
    else
        # Check for changes against main
        echo "Comparing $current_branch against origin/main"
        
        # Ensure main is up to date
        git fetch origin main --quiet || echo "Could not fetch origin/main"
        
        # Detect changed files
        if git diff --name-only origin/main...HEAD | grep -E '^apps/web/|^lib/(shared-components|tamagui-config)/' > /dev/null; then
            echo "web=true" > .ci-changes
        else
            echo "web=false" > .ci-changes
        fi
        
        if git diff --name-only origin/main...HEAD | grep -E '^apps/app/|^lib/(shared-components|tamagui-config)/' > /dev/null; then
            echo "mobile=true" >> .ci-changes
        else
            echo "mobile=false" >> .ci-changes
        fi
        
        if git diff --name-only origin/main...HEAD | grep -E '^lambdas/|^lib/(api|db-client)/' > /dev/null; then
            echo "lambdas=true" >> .ci-changes
        else
            echo "lambdas=false" >> .ci-changes
        fi
        
        if git diff --name-only origin/main...HEAD | grep -E '^terraform/' > /dev/null; then
            echo "terraform=true" >> .ci-changes
        else
            echo "terraform=false" >> .ci-changes
        fi
    fi
    
    echo "Change detection results:"
    cat .ci-changes | while read line; do
        echo "  $line"
    done
    
    return 0
}

# Function for code quality checks
code_quality_checks() {
    echo -e "${CYAN}🎨 Checking code formatting...${NC}"
    if [ "$VERBOSE" = true ]; then
        echo "Command: npx nx format:check --base=origin/main --head=HEAD"
    fi
    
    if ! npx nx format:check --base=origin/main --head=HEAD; then
        echo -e "${RED}❌ Code formatting issues detected${NC}"
        echo -e "${YELLOW}💡 Fix with: npx nx format:write${NC}"
        return 1
    fi
    
    echo -e "${CYAN}🔧 Running ESLint validation...${NC}"
    if [ "$VERBOSE" = true ]; then
        echo "Command: npx nx affected -t lint --base=origin/main --head=HEAD --parallel=4"
    fi
    
    if ! npx nx affected -t lint --base=origin/main --head=HEAD --parallel=4; then
        echo -e "${RED}❌ ESLint validation failed${NC}"
        echo -e "${YELLOW}💡 Try auto-fix: npx nx affected -t lint --fix${NC}"
        return 1
    fi
    
    echo -e "${CYAN}📝 Running TypeScript type check...${NC}"
    if [ "$VERBOSE" = true ]; then
        echo "Command: npx nx affected -t typecheck --base=origin/main --head=HEAD --parallel=2"
    fi
    
    if ! npx nx affected -t typecheck --base=origin/main --head=HEAD --parallel=2; then
        echo -e "${RED}❌ TypeScript validation failed${NC}"
        echo -e "${YELLOW}💡 Check types: npx nx affected -t typecheck${NC}"
        return 1
    fi
    
    return 0
}

# Function for running tests
run_tests() {
    echo -e "${CYAN}🧪 Running unit tests...${NC}"
    if [ "$VERBOSE" = true ]; then
        echo "Command: npx nx affected -t test --base=origin/main --head=HEAD --parallel=4 --coverage=false"
    fi
    
    if ! npx nx affected -t test --base=origin/main --head=HEAD --parallel=4 --coverage=false; then
        echo -e "${RED}❌ Unit tests failed${NC}"
        echo -e "${YELLOW}💡 Debug specific test: npx nx test <project-name>${NC}"
        return 1
    fi
    
    # Check if integration tests exist and should run
    if [ -f "jest.integration.config.js" ] || npm run test:integration --dry-run > /dev/null 2>&1; then
        echo -e "${CYAN}🔄 Running integration tests...${NC}"
        if ! npm run test:integration; then
            echo -e "${RED}❌ Integration tests failed${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}ℹ️  No integration tests configured, skipping${NC}"
    fi
    
    return 0
}

# Function for build validation
build_validation() {
    # Check what components are affected
    source .ci-changes
    
    if [ "$web" = "true" ]; then
        echo -e "${CYAN}📦 Building web application...${NC}"
        if [ "$VERBOSE" = true ]; then
            echo "Command: npx nx build web --verbose"
        fi
        
        if ! npx nx build web $([ "$VERBOSE" = true ] && echo "--verbose"); then
            echo -e "${RED}❌ Web application build failed${NC}"
            return 1
        fi
        
        # Check build artifacts
        if [ -d "dist/apps/web" ]; then
            build_size=$(du -sh dist/apps/web | cut -f1)
            echo -e "${GREEN}✅ Web build completed successfully (size: $build_size)${NC}"
        fi
    fi
    
    if [ "$lambdas" = "true" ]; then
        echo -e "${CYAN}⚡ Building lambda functions...${NC}"
        if [ "$VERBOSE" = true ]; then
            echo "Command: npx nx affected -t build --base=origin/main --head=HEAD --projects='lambdas-*'"
        fi
        
        if ! npx nx affected -t build --base=origin/main --head=HEAD --projects="lambdas-*"; then
            echo -e "${RED}❌ Lambda functions build failed${NC}"
            return 1
        fi
        
        # Try to package lambdas
        echo -e "${CYAN}📦 Packaging lambda functions...${NC}"
        if npx nx affected -t package --base=origin/main --head=HEAD --projects="lambdas-*" 2>/dev/null; then
            echo -e "${GREEN}✅ Lambda functions packaged successfully${NC}"
        else
            echo -e "${YELLOW}⚠️  Lambda packaging failed (may be expected if no package target)${NC}"
        fi
    fi
    
    if [ "$mobile" = "true" ]; then
        echo -e "${CYAN}📱 Validating mobile build configuration...${NC}"
        if [ "$VERBOSE" = true ]; then
            echo "Command: npx nx build app --dry-run"
        fi
        
        if ! npx nx build app --dry-run; then
            echo -e "${RED}❌ Mobile build configuration is invalid${NC}"
            return 1
        fi
        
        echo -e "${GREEN}✅ Mobile build configuration is valid${NC}"
        echo -e "${CYAN}ℹ️  Note: Full mobile builds require platform-specific environments${NC}"
    fi
    
    return 0
}

# Function for deployment validation
deployment_validation() {
    source .ci-changes
    
    if [ "$terraform" = "true" ]; then
        echo -e "${CYAN}🔐 Validating Terraform configuration...${NC}"
        
        cd terraform
        
        if [ "$VERBOSE" = true ]; then
            echo "Command: terraform init -backend=false"
        fi
        
        if ! terraform init -backend=false; then
            echo -e "${RED}❌ Terraform initialization failed${NC}"
            cd ..
            return 1
        fi
        
        if [ "$VERBOSE" = true ]; then
            echo "Command: terraform validate"
        fi
        
        if ! terraform validate; then
            echo -e "${RED}❌ Terraform validation failed${NC}"
            cd ..
            return 1
        fi
        
        cd ..
        echo -e "${GREEN}✅ Terraform configuration is valid${NC}"
    fi
    
    return 0
}

# Main execution
echo "Starting CI simulation..."
echo "Base branch: origin/main"
echo "Current branch: $(git branch --show-current)"
echo ""

# Run stages
run_stage "Environment Setup" "setup" setup_environment
run_stage "Change Detection" "detect" detect_changes
run_stage "Code Quality Checks" "quality" code_quality_checks
run_stage "Test Execution" "test" run_tests
run_stage "Build Validation" "build" build_validation
run_stage "Deployment Validation" "deploy" deployment_validation

# Final summary
echo -e "${GREEN}🎉 CI Pipeline Simulation Completed Successfully!${NC}"
echo ""
echo -e "${CYAN}📋 Summary:${NC}"
echo "• All code quality checks passed"
echo "• All tests executed successfully"
echo "• All builds completed without errors"
echo "• Deployment validation passed"
echo ""
echo -e "${BLUE}💡 Next Steps:${NC}"
echo "• Your changes are ready for CI"
echo "• Push your branch and create a PR"
echo "• The actual CI should behave similarly to this simulation"
echo ""

# Cleanup
rm -f .ci-changes

echo -e "${GREEN}✅ Local CI simulation complete!${NC}"
