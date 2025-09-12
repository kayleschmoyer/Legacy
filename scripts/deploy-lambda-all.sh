#!/bin/bash

# Quick Lambda deployment script
# Usage: ./deploy-lambda-all.sh [environment]

set -e

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Deploying all Lambda functions to environment: $ENVIRONMENT"

# Array of Lambda functions to deploy
FUNCTIONS=("graphql" "stats" "oauth-proxy")

# Deploy each function
for func in "${FUNCTIONS[@]}"; do
    echo ""
    echo "=================================="
    echo "Deploying $func Lambda..."
    echo "=================================="
    
    "$SCRIPT_DIR/deploy-lambda.sh" "$func" "$ENVIRONMENT"
done

echo ""
echo "✅ All Lambda functions deployed successfully!"
echo ""
echo "🔄 Final steps:"
echo "   1. Run 'cd terraform && terraform plan' to see all updates"
echo "   2. Run 'terraform apply' to deploy all new versions"