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
    temp_output=$(mktemp)
    temp_error=$(mktemp)
    
    # Test 1: Basic CLI availability
    echo "  1️⃣  Testing Nx Cloud CLI availability..."
    if timeout 10 pnpm exec nx-cloud --version > "$temp_output" 2>"$temp_error"; then
        echo -e "     ${GREEN}✅ Nx Cloud CLI available${NC}"
    else
        echo -e "     ${RED}❌ Nx Cloud CLI test failed${NC}"
        cat "$temp_error" | head -3
        rm -f "$temp_output" "$temp_error"
        return 1
    fi
    
    # Test 2: API connectivity test with workspace info
    echo "  2️⃣  Testing API connectivity and authentication..."
    if timeout 20 pnpm exec nx-cloud workspace-status > "$temp_output" 2>"$temp_error"; then
        api_accessible=true
        echo -e "     ${GREEN}✅ API accessible and authenticated${NC}"
        
        # Check for quota status in output
        if grep -i "exceeding.*free.*plan\|quota.*exceeded\|usage.*limit" "$temp_output" > /dev/null 2>&1; then
            quota_status="exceeded"
            echo -e "     ${YELLOW}⚠️  Quota limits detected in workspace status${NC}"
        else
            quota_status="available"
            echo -e "     ${GREEN}✅ Within quota limits${NC}"
        fi
    else
        echo -e "     ${RED}❌ API connectivity test failed${NC}"
        
        # Check for specific error patterns
        if grep -i "exceeding.*free.*plan\|quota.*exceeded\|organization.*disabled\|status code 401\|unauthorized" "$temp_error" > /dev/null 2>&1; then
            quota_status="exceeded"
            echo -e "     ${YELLOW}⚠️  Quota exceeded or unauthorized (detected from error)${NC}"
        else
            echo -e "     ${RED}❌ Unknown API error${NC}"
            if [ "$TEST_ONLY" = true ]; then
                echo "Error output:"
                cat "$temp_error" | head -3
            fi
        fi
        test_result=1
    fi
    
    # Test 3: Try a lightweight distributed execution test (only if API is accessible)
    if [ "$api_accessible" = true ] && [ "$quota_status" = "available" ]; then
        echo "  3️⃣  Testing distributed execution capability..."
        if timeout 15 pnpm exec nx-cloud start-ci-run --help > "$temp_output" 2>"$temp_error"; then
            echo -e "     ${GREEN}✅ Distributed execution available${NC}"
        else
            if grep -i "exceeding.*free.*plan\|quota.*exceeded" "$temp_error" > /dev/null 2>&1; then
                quota_status="exceeded"
                echo -e "     ${YELLOW}⚠️  Distributed execution quota exceeded${NC}"
                test_result=1
            else
                echo -e "     ${YELLOW}⚠️  Distributed execution test inconclusive${NC}"
            fi
        fi
    fi
    
    # Cleanup and summary
    rm -f "$temp_output" "$temp_error"
    
    echo -e "${CYAN}📊 Test Summary:${NC}"
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
