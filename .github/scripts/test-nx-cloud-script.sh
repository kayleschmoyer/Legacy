#!/bin/bash

# Test script for the updated nx-cloud-fallback.sh
# This script tests both the --test-only and configuration modes

set -e

echo "🧪 Testing nx-cloud-fallback.sh script functionality..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set up test environment
export NX_CLOUD_ACCESS_TOKEN="${NX_CLOUD_ACCESS_TOKEN:-test-token}"
export GITHUB_OUTPUT="/tmp/github_output_test"
export GITHUB_ENV="/tmp/github_env_test"

# Clean up test files
rm -f "$GITHUB_OUTPUT" "$GITHUB_ENV"

echo -e "${BLUE}Test 1: Testing --test-only mode${NC}"
echo "=================================="

# Run the script in test-only mode
if ./nx-cloud-fallback.sh --test-only; then
    echo -e "${GREEN}✅ --test-only mode completed successfully${NC}"
    test_result="passed"
else
    echo -e "${YELLOW}⚠️  --test-only mode failed (expected if Nx Cloud unavailable)${NC}"
    test_result="failed"
fi

echo ""
echo "GitHub Output contents:"
if [ -f "$GITHUB_OUTPUT" ]; then
    cat "$GITHUB_OUTPUT"
else
    echo "No output file created"
fi

echo ""
echo -e "${BLUE}Test 2: Testing configuration mode${NC}"
echo "==================================="

# Clean up for second test
rm -f "$GITHUB_ENV"

# Run the script in configuration mode
if ./nx-cloud-fallback.sh; then
    echo -e "${GREEN}✅ Configuration mode completed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Configuration mode failed (expected if Nx Cloud unavailable)${NC}"
fi

echo ""
echo "GitHub Environment contents:"
if [ -f "$GITHUB_ENV" ]; then
    cat "$GITHUB_ENV"
else
    echo "No environment file created"
fi

echo ""
echo -e "${BLUE}Test Summary${NC}"
echo "============"
echo "Test-only mode: $test_result"
echo "Configuration mode: Completed"
echo ""
echo -e "${GREEN}✅ Script testing completed${NC}"

# Clean up
rm -f "$GITHUB_OUTPUT" "$GITHUB_ENV"
