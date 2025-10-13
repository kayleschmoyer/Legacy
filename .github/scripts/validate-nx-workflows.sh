#!/bin/bash

# Test script to validate workflow changes
# This script checks that all workflows have consistent Nx cloud configuration

set -e

echo "🧪 Validating Nx Cloud configuration across all workflows..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

WORKFLOWS_DIR=".github/workflows"
ERRORS=0

echo -e "${BLUE}1. Checking workflows that use the new configure-nx-cloud action...${NC}"

# Workflows that should use the new action
DISTRIBUTED_WORKFLOWS=("pr-validation.yml")

for workflow in "${DISTRIBUTED_WORKFLOWS[@]}"; do
    if [ -f "$WORKFLOWS_DIR/$workflow" ]; then
        if grep -q "uses: ./.github/actions/configure-nx-cloud" "$WORKFLOWS_DIR/$workflow"; then
            echo -e "   ✅ $workflow - Uses configure-nx-cloud action"
        else
            echo -e "   ❌ $workflow - Missing configure-nx-cloud action"
            ((ERRORS++))
        fi
    else
        echo -e "   ⚠️  $workflow - File not found"
    fi
done

echo ""
echo -e "${BLUE}2. Checking deployment workflows for basic Nx environment setup...${NC}"

# Workflows that should have basic Nx setup
DEPLOYMENT_WORKFLOWS=("publish-oauth-proxy.yml" "publish-stats-lambda.yml" "deploy-web.yml")

for workflow in "${DEPLOYMENT_WORKFLOWS[@]}"; do
    if [ -f "$WORKFLOWS_DIR/$workflow" ]; then
        if grep -q "Configure Basic Nx Environment" "$WORKFLOWS_DIR/$workflow"; then
            echo -e "   ✅ $workflow - Has basic Nx environment setup"
        else
            echo -e "   ❌ $workflow - Missing basic Nx environment setup"
            ((ERRORS++))
        fi
    else
        echo -e "   ⚠️  $workflow - File not found"
    fi
done

echo ""
echo -e "${BLUE}3. Checking for enhanced nx-cloud fix-ci commands...${NC}"

# Workflows that use nx-cloud fix-ci
FIXCI_WORKFLOWS=("publish-oauth-proxy.yml" "publish-stats-lambda.yml")

for workflow in "${FIXCI_WORKFLOWS[@]}"; do
    if [ -f "$WORKFLOWS_DIR/$workflow" ]; then
        if grep -q "Running Nx Cloud self-healing" "$WORKFLOWS_DIR/$workflow"; then
            echo -e "   ✅ $workflow - Has enhanced nx-cloud fix-ci"
        else
            echo -e "   ❌ $workflow - Missing enhanced nx-cloud fix-ci"
            ((ERRORS++))
        fi
    else
        echo -e "   ⚠️  $workflow - File not found"
    fi
done

echo ""
echo -e "${BLUE}4. Checking for proper environment variable defaults...${NC}"

# Check that workflows have proper default environment variables
for workflow_file in "$WORKFLOWS_DIR"/*.yml; do
    if [ -f "$workflow_file" ]; then
        workflow_name=$(basename "$workflow_file")
        
        # Skip workflows that don't use Nx
        if ! grep -q "npx nx" "$workflow_file" && ! grep -q "configure-nx-cloud" "$workflow_file"; then
            continue
        fi
        
        # Check for NX_CLOUD_ACCESS_TOKEN
        if grep -q "NX_CLOUD_ACCESS_TOKEN.*secrets.NX_CLOUD_ACCESS_TOKEN" "$workflow_file"; then
            echo -e "   ✅ $workflow_name - Has NX_CLOUD_ACCESS_TOKEN configured"
        else
            echo -e "   ❌ $workflow_name - Missing NX_CLOUD_ACCESS_TOKEN configuration"
            ((ERRORS++))
        fi
    fi
done

echo ""
echo -e "${BLUE}5. Verifying configure-nx-cloud action exists...${NC}"

if [ -f ".github/actions/configure-nx-cloud/action.yml" ]; then
    echo -e "   ✅ configure-nx-cloud action exists"
    
    # Check that it has required inputs and outputs
    if grep -q "agent-count:" ".github/actions/configure-nx-cloud/action.yml"; then
        echo -e "   ✅ configure-nx-cloud has agent-count input"
    else
        echo -e "   ❌ configure-nx-cloud missing agent-count input"
        ((ERRORS++))
    fi
    
    if grep -q "cloud-available:" ".github/actions/configure-nx-cloud/action.yml"; then
        echo -e "   ✅ configure-nx-cloud has cloud-available output"
    else
        echo -e "   ❌ configure-nx-cloud missing cloud-available output"
        ((ERRORS++))
    fi
else
    echo -e "   ❌ configure-nx-cloud action missing"
    ((ERRORS++))
fi

echo ""
echo -e "${BLUE}📊 Validation Summary${NC}"
echo "===================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All Nx Cloud configuration checks passed!${NC}"
    echo -e "${GREEN}🚀 Workflows are ready for Nx Cloud with proper fallbacks${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS configuration issues${NC}"
    echo -e "${YELLOW}⚠️  Please review and fix the issues above${NC}"
    exit 1
fi
