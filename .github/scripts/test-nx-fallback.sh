#!/bin/bash

# Nx Cloud Fallback Testing Script
# This script simulates different Nx Cloud availability scenarios to test fallback behavior

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing Nx Cloud Fallback Functionality${NC}"
echo "============================================="

# Function to test fallback script
test_fallback_script() {
    local test_name="$1"
    local nx_token="$2"
    
    echo ""
    echo -e "${BLUE}📋 Test: $test_name${NC}"
    echo "----------------------------------------"
    
    # Set up test environment
    export NX_CLOUD_ACCESS_TOKEN="$nx_token"
    
    # Clear any existing environment variables
    unset NX_CLOUD_DISTRIBUTED_EXECUTION
    unset NX_LOCAL_FALLBACK
    unset NX_PARALLEL
    
    # Create temporary GitHub environment file for testing
    export GITHUB_ENV=$(mktemp)
    
    echo "NX_CLOUD_ACCESS_TOKEN: ${NX_CLOUD_ACCESS_TOKEN:+[SET]}${NX_CLOUD_ACCESS_TOKEN:-[NOT SET]}"
    
    # Run the fallback detection script
    if ./.github/scripts/nx-cloud-fallback.sh; then
        echo -e "${GREEN}✅ Fallback script completed successfully${NC}"
        
        # Show what environment variables were set
        echo ""
        echo "Environment variables set:"
        cat "$GITHUB_ENV" | while read -r line; do
            echo "  $line"
        done
        
    else
        echo -e "${RED}❌ Fallback script failed${NC}"
        return 1
    fi
    
    # Clean up
    rm -f "$GITHUB_ENV"
    unset GITHUB_ENV
}

# Test 1: No NX_CLOUD_ACCESS_TOKEN (should fallback to local)
test_fallback_script "No Access Token" ""

# Test 2: Invalid NX_CLOUD_ACCESS_TOKEN (should fallback to local)
test_fallback_script "Invalid Access Token" "invalid-token-12345"

# Test 3: Valid format token (may work or may not, depending on actual service)
test_fallback_script "Valid Format Token" "${NX_CLOUD_ACCESS_TOKEN:-test-token}"

echo ""
echo -e "${GREEN}🎉 All fallback tests completed!${NC}"
echo ""
echo -e "${YELLOW}💡 Usage in CI:${NC}"
echo "  1. The setup action automatically runs the fallback detection"
echo "  2. If Nx Cloud is unavailable, it sets NX_LOCAL_FALLBACK=true"
echo "  3. The nx-tasks action respects this flag and uses local execution"
echo "  4. Workflows show clear indication of execution mode"
echo ""
echo -e "${YELLOW}📋 To manually test in your environment:${NC}"
echo "  # Test with no token (should fallback)"
echo "  unset NX_CLOUD_ACCESS_TOKEN"
echo "  ./.github/scripts/nx-cloud-fallback.sh"
echo ""
echo "  # Test with your real token (should use Nx Cloud if quota available)"
echo "  export NX_CLOUD_ACCESS_TOKEN='your-real-token'"
echo "  ./.github/scripts/nx-cloud-fallback.sh"
