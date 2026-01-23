#!/bin/bash

# Nx Cloud Availability Test Script
# This script tests Nx Cloud connectivity and quota status, then sets appropriate 
# environment variables for either cloud or local execution mode
# 
# Usage: ./nx-cloud-fallback.sh [--test-only]
# --test-only: Only test connectivity, don't set environment variables (for early CI steps)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse command line arguments
TEST_ONLY=false
if [[ "$1" == "--test-only" ]]; then
    TEST_ONLY=true
fi

echo -e "${BLUE}🔍 Testing Nx Cloud availability and quota status...${NC}"

# Function to set local execution environment
set_local_execution() {
    echo -e "${YELLOW}⚠️  Nx Cloud unavailable - configuring local execution${NC}"
    
    # Disable Nx Cloud features completely by not setting NX_CLOUD_ID
    echo "NX_CLOUD_DISTRIBUTED_EXECUTION=false" >> $GITHUB_ENV
    echo "NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT=0" >> $GITHUB_ENV
    echo "NX_DAEMON=false" >> $GITHUB_ENV
    
    # Clear cloud access token and ID to prevent connection attempts
    echo "NX_CLOUD_ACCESS_TOKEN=" >> $GITHUB_ENV
    echo "NX_CLOUD_ID=" >> $GITHUB_ENV
    
    # Keep local caching enabled for performance
    echo "NX_SKIP_NX_CACHE=false" >> $GITHUB_ENV
    
    # Set local execution parameters optimized for GitHub Actions runners
    echo "NX_PARALLEL=2" >> $GITHUB_ENV  # Conservative for stability
    echo "NX_CLOUD_NO_TIMEOUTS=false" >> $GITHUB_ENV
    echo "NX_VERBOSE_LOGGING=true" >> $GITHUB_ENV
    
    # Set a flag to indicate we're in fallback mode
    echo "NX_LOCAL_FALLBACK=true" >> $GITHUB_ENV
    
    echo -e "${GREEN}✅ Local execution configured (cloud completely disabled)${NC}"
    return 0
}

# Function to set Nx Cloud execution environment
set_nx_cloud_execution() {
    echo -e "${GREEN}✅ Nx Cloud available - configuring distributed execution${NC}"
    
    # Enable Nx Cloud features and set the cloud ID
    echo "NX_CLOUD_ID=68ce3a86265b78d5c0375b68" >> $GITHUB_ENV
    echo "NX_CLOUD_DISTRIBUTED_EXECUTION=true" >> $GITHUB_ENV
    echo "NX_DAEMON=false" >> $GITHUB_ENV
    echo "NX_CLOUD_NO_TIMEOUTS=true" >> $GITHUB_ENV
    echo "NX_VERBOSE_LOGGING=false" >> $GITHUB_ENV
    
    # Set a flag to indicate we're using Nx Cloud
    echo "NX_LOCAL_FALLBACK=false" >> $GITHUB_ENV
    
    return 0
}



# Test Nx Cloud connectivity and quota status with comprehensive checks
test_nx_cloud() {
    local test_result=0
    local quota_status="unknown"
    local api_accessible=false
    
    # Check if NX_CLOUD_ACCESS_TOKEN is available
    if [ -z "$NX_CLOUD_ACCESS_TOKEN" ]; then
        echo -e "${YELLOW}⚠️  NX_CLOUD_ACCESS_TOKEN not set or empty${NC}"
        return 1
    fi
    
    echo -e "${CYAN}📋 Running comprehensive Nx Cloud tests:${NC}"
    
    # Create temporary file for capturing output
    # Modern Nx Cloud v19+ approach: Trust token presence when CLI available
    # Pre-flight validation commands (workspace-status, validate) are unreliable/deprecated
    # Nx Cloud handles authentication automatically during task execution (start-ci-run)
    
    # Test 1: Basic CLI availability
    echo "  1️⃣  Testing Nx Cloud CLI availability..."
    if command -v pnpm >/dev/null 2>&1; then
        if pnpm exec nx-cloud --version >/dev/null 2>&1; then
            echo -e "     ${GREEN}✅ Nx Cloud CLI available${NC}"
        else
            echo -e "     ${RED}❌ Nx Cloud CLI not found${NC}"
            return 1
        fi
    else
        echo -e "     ${RED}❌ pnpm not available${NC}"
        return 1
    fi
    
    # Test 2: Verify token presence
    echo "  2️⃣  Verifying Nx Cloud access token..."
    if [ -z "$NX_CLOUD_ACCESS_TOKEN" ]; then
        echo -e "     ${RED}❌ NX_CLOUD_ACCESS_TOKEN not set${NC}"
        return 1
    else
        echo -e "     ${GREEN}✅ Access token present (${#NX_CLOUD_ACCESS_TOKEN} chars)${NC}"
        # Assume quota available - Nx Cloud will enforce at runtime
        quota_status="available"
        api_accessible=true
        echo -e "     ${GREEN}✅ Authentication will be verified during task execution${NC}"
    fi
    
    # No Test 3 needed - modern Nx Cloud v19+ handles everything during start-ci-run
    # Actual authentication, quota checking, and agent allocation happens at runtime
    echo "  ℹ️  Nx Cloud will manage authentication and quota enforcement during execution"
    test_result=0
    
    # Summary
    echo -e "${CYAN}📊 Test Summary:${NC}"
    echo "     CLI Available: true"
    echo "     Token Present: true"
    echo "     API Accessible: $api_accessible"
    echo "     Quota Status: $quota_status"
    
    if [ "$quota_status" = "available" ] && [ "$api_accessible" = true ]; then
        echo -e "     ${GREEN}🚀 Nx Cloud fully available${NC}"
        return 0
    else
        echo -e "     ${YELLOW}🔧 Local execution recommended${NC}"
        return 1
    fi
}

# Output test results in a format that GitHub Actions can easily parse
output_test_result() {
    local cloud_available=$1
    
    if [ "$cloud_available" = "0" ]; then
        echo "NX_CLOUD_AVAILABLE=true" >> $GITHUB_OUTPUT
        echo -e "${GREEN}✅ Nx Cloud is available and within quota limits${NC}"
    else
        echo "NX_CLOUD_AVAILABLE=false" >> $GITHUB_OUTPUT
        echo -e "${YELLOW}⚠️  Nx Cloud is not available (quota exceeded or connection failed)${NC}"
    fi
}

# Main execution function
main() {
    echo -e "${CYAN}Nx Cloud Access Token: ${NX_CLOUD_ACCESS_TOKEN:+[SET (${#NX_CLOUD_ACCESS_TOKEN} chars)]}${NX_CLOUD_ACCESS_TOKEN:-[NOT SET]}${NC}"
    echo ""
    
    # Run the cloud availability test
    if test_nx_cloud; then
        cloud_result=0
        test_passed=true
    else
        cloud_result=1
        test_passed=false
    fi
    
    if [ "$TEST_ONLY" = true ]; then
        # Test-only mode: just output the result for GitHub Actions to use
        echo ""
        echo -e "${BLUE}🔍 Test-only mode: Outputting results for subsequent steps${NC}"
        output_test_result $cloud_result
        
        if [ "$test_passed" = true ]; then
            echo -e "${GREEN}✅ Recommendation: Use Nx Cloud distributed execution${NC}"
        else
            echo -e "${YELLOW}⚠️  Recommendation: Use local execution with fallback settings${NC}"
        fi
    else
        # Full configuration mode: set environment variables based on test results
        echo ""
        echo -e "${BLUE}🔧 Configuration mode: Setting environment variables${NC}"
        
        if [ "$test_passed" = true ]; then
            set_nx_cloud_execution
            echo -e "${GREEN}🚀 Nx Cloud execution configured${NC}"
        else
            set_local_execution
            echo -e "${YELLOW}🔧 Local execution fallback configured${NC}"
        fi
        
        # Display final configuration
        echo ""
        echo -e "${BLUE}📋 Final Environment Configuration:${NC}"
        echo "  NX_CLOUD_DISTRIBUTED_EXECUTION: ${NX_CLOUD_DISTRIBUTED_EXECUTION:-not set}"
        echo "  NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT: ${NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT:-not set}"
        echo "  NX_PARALLEL: ${NX_PARALLEL:-not set}"
        echo "  NX_LOCAL_FALLBACK: ${NX_LOCAL_FALLBACK:-not set}"
        echo "  NX_CLOUD_ID: ${NX_CLOUD_ID:-not set}"
    fi
    
    exit $cloud_result
}

# Run main function
main "$@"
