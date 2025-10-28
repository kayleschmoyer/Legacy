#!/bin/bash

# Lambda Deployment Script for S3-based deployments
# This script builds, packages, and uploads Lambda functions to S3
# Usage: ./deploy-lambda.sh <function-name> [environment]

set -e

# Configuration
FUNCTION_NAME=${1:-}
ENVIRONMENT=${2:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}

if [ -z "$FUNCTION_NAME" ]; then
    echo "Usage: $0 <function-name> [environment]"
    echo "Available functions: graphql, stats, oauth-proxy, game-selection"
    exit 1
fi

# Function to create version string
create_version() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local commit_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    echo "${timestamp}-${commit_sha}"
}

# Function to get S3 bucket name
get_s3_bucket() {
    aws ssm get-parameter \
        --name "/legacy-sports/${ENVIRONMENT}/s3/lambda-deployments-bucket" \
        --query "Parameter.Value" \
        --output text 2>/dev/null || \
    terraform output -raw lambda_deployments_bucket_name 2>/dev/null || {
        echo "Error: Could not determine S3 bucket name"
        echo "Make sure Terraform is applied or SSM parameter exists"
        exit 1
    }
}

# Function-specific configurations
case $FUNCTION_NAME in
    "graphql")
        LAMBDA_DIR="lambdas/db"
        BUILD_COMMAND="pnpm run build"
        DIST_DIR="dist"
        SSM_PARAM="/legacy-sports/${ENVIRONMENT}/lambda/graphql/version"
        ;;
    "stats")
        LAMBDA_DIR="lambdas/stats-lambda"
        BUILD_COMMAND="pnpm exec nx run stats-lambda:build"
        DIST_DIR="dist"
        SSM_PARAM="/legacy-sports/${ENVIRONMENT}/lambda/stats/version"
        ;;
    "oauth-proxy")
        LAMBDA_DIR="lambdas/oauth-proxy"
        BUILD_COMMAND="pnpm exec nx run oauth-proxy:build"
        DIST_DIR="dist"
        SSM_PARAM="/legacy-sports/${ENVIRONMENT}/lambda/oauth-proxy/version"
        ;;
    "game-selection")
        LAMBDA_DIR="lambdas/game-selection"
        BUILD_COMMAND="pnpm exec nx run game-selection:build"
        DIST_DIR="dist"
        SSM_PARAM="/legacy-sports/${ENVIRONMENT}/lambda/game-selection/version"
        ;;
    *)
        echo "Error: Unknown function name '$FUNCTION_NAME'"
        echo "Available functions: graphql, stats, oauth-proxy, game-selection"
        exit 1
        ;;
esac

echo "🚀 Deploying Lambda function: $FUNCTION_NAME"
echo "Environment: $ENVIRONMENT"
echo "Lambda directory: $LAMBDA_DIR"

# Check if directory exists
if [ ! -d "$LAMBDA_DIR" ]; then
    echo "Error: Lambda directory '$LAMBDA_DIR' does not exist"
    exit 1
fi

# Create version
VERSION=$(create_version)
echo "Version: $VERSION"

# Get S3 bucket name
S3_BUCKET=$(get_s3_bucket)
echo "S3 Bucket: $S3_BUCKET"

# Build the Lambda
echo "📦 Building Lambda function..."
cd "$LAMBDA_DIR"
$BUILD_COMMAND

# Verify build output exists
if [ ! -d "$DIST_DIR" ]; then
    echo "Error: Build directory '$DIST_DIR' does not exist after build"
    exit 1
fi

# Create deployment package
echo "📦 Creating deployment package..."
PACKAGE_NAME="${FUNCTION_NAME}-${VERSION}.zip"
zip -r "$PACKAGE_NAME" "$DIST_DIR"/*

# Upload to S3
echo "☁️  Uploading to S3..."
S3_KEY="${FUNCTION_NAME}/${PACKAGE_NAME}"
aws s3 cp "$PACKAGE_NAME" "s3://${S3_BUCKET}/${S3_KEY}" \
    --region "$AWS_REGION"

# Update SSM parameter with new version
echo "🔄 Updating SSM parameter..."
aws ssm put-parameter \
    --name "$SSM_PARAM" \
    --value "$VERSION" \
    --overwrite \
    --region "$AWS_REGION"

# Cleanup local package
rm "$PACKAGE_NAME"

# Return to original directory
cd - > /dev/null

echo "✅ Lambda deployment completed successfully!"
echo "   Function: $FUNCTION_NAME"
echo "   Version: $VERSION"
echo "   S3 Location: s3://${S3_BUCKET}/${S3_KEY}"
echo "   SSM Parameter: $SSM_PARAM"
echo ""
echo "🔄 Next steps:"
echo "   1. Run 'terraform plan' to see Lambda function updates"
echo "   2. Run 'terraform apply' to deploy the new version"