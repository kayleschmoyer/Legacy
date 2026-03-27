#!/bin/bash

# Legacy Sports Environment Variables Sync Script (Bash)
# This script pulls environment variables from AWS and updates the .env file
#
# New Unified Database Credential Strategy:
# - USE_LOCAL_CREDENTIALS=false (use AWS Secrets Manager for production)
# - DB_SECRET_NAME: Points to AWS Secrets Manager secret
# - DB_HOST: Database endpoint (proxy preferred for production)
# - Credentials are automatically resolved by the new credential system

set -e

ENVIRONMENT=${1:-dev}
TERRAFORM_DIR=${2:-terraform}
ENV_FILE=${3:-.env}
DRY_RUN=${DRY_RUN:-false}
BACKUP=${BACKUP:-false}
DATABASE_ENDPOINT=${DATABASE_ENDPOINT:-proxy}  # Use proxy endpoint for production by default

echo "Legacy Sports Environment Sync"
echo "================================="
echo ""

# Check if we're in the right directory
if [ ! -d "$TERRAFORM_DIR" ]; then
    echo "Error: Terraform directory not found. Please run this script from the project root."
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found. Please run this script from the project root."
    exit 1
fi

# Backup existing .env file if requested
if [ "$BACKUP" = "true" ]; then
    BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d-%H%M%S)"
    cp "$ENV_FILE" "$BACKUP_FILE"
    echo "✓ Backed up existing .env file to $BACKUP_FILE"
fi

echo "Fetching Terraform outputs..."
cd "$TERRAFORM_DIR"
TERRAFORM_OUTPUT=$(terraform output -json)
cd ..

# Extract values using jq
DB_CREDS_SECRET_NAME=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.db_creds_secret_name')
JWT_SECRET_NAME=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.jwt_secret_name')
GOOGLE_SECRET_NAME=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.google_oauth_client_secret_name')
COOKIE_SECRET_NAME=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.oauth_proxy_cookie_secret_name')
GOOGLE_CLIENT_ID=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.google_oauth_client_id')
DB_HOST=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.db_host')
AWS_REGION=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.aws_region')
RDS_PROXY_ENDPOINT=$(echo "$TERRAFORM_OUTPUT" | jq -r '.rds_proxy_endpoint.value')
SQS_LOAD_SEASON_STATS_URL=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.sqs_load_season_stats_url')
SQS_AUTOMATIC_DRAFTS_URL=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.sqs_automatic_drafts_url')
SQS_SELECT_GAME_URL=$(echo "$TERRAFORM_OUTPUT" | jq -r '.environment_variables_summary.value.sqs_select_game_url')
# Legacy support
SQS_QUEUE_URL=$SQS_LOAD_SEASON_STATS_URL
OAUTH_PROXY_ENDPOINT=$(echo "$TERRAFORM_OUTPUT" | jq -r '.oauth_proxy_endpoint.value')
GRAPHQL_ENDPOINT=$(echo "$TERRAFORM_OUTPUT" | jq -r '.graphql_endpoint.value')
WEBSOCKET_URL=$(echo "$TERRAFORM_OUTPUT" | jq -r '.websocket_url.value')

# Get direct database endpoint for migrations (if available)
cd "$TERRAFORM_DIR"
DB_HOST_DIRECT=$(terraform output -raw rds_instance_endpoint 2>/dev/null || echo "")
cd ..

# Set main DB_HOST based on preference (proxy is preferred for production)
if [ "$DATABASE_ENDPOINT" = "direct" ] && [ -n "$DB_HOST_DIRECT" ]; then
    DB_HOST_MAIN="$DB_HOST_DIRECT"
    echo "Using direct database endpoint for DB_HOST (for migrations/admin)"
else
    DB_HOST_MAIN="$DB_HOST"
    echo "Using RDS proxy endpoint for DB_HOST (recommended for production)"
fi

echo "Fetching secrets from AWS..."

# Note: With the new credential system, we store the secret NAME, not the actual credentials
# This allows the credential resolver to fetch them securely at runtime

# Get JWT secret
echo "  JWT secret from: $JWT_SECRET_NAME"
JWT_SECRET=$(aws secretsmanager get-secret-value --secret-id "$JWT_SECRET_NAME" --query "SecretString" --output text)

# Get Google OAuth client secret
echo "  Google OAuth secret from: $GOOGLE_SECRET_NAME"
GOOGLE_SECRET=$(aws secretsmanager get-secret-value --secret-id "$GOOGLE_SECRET_NAME" --query "SecretString" --output text)

# Get OAuth proxy cookie secret
echo "  Cookie secret from: $COOKIE_SECRET_NAME"
COOKIE_SECRET=$(aws secretsmanager get-secret-value --secret-id "$COOKIE_SECRET_NAME" --query "SecretString" --output text)

echo ""
echo "Building environment variables..."

# Create a temporary file with the new values
TEMP_ENV=$(mktemp)

# Define the variables we want to update (New Unified Credential System)
cat > "$TEMP_ENV" << EOF
# OAuth Configuration
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_CLIENT_ID
CLIENT_ID=$GOOGLE_CLIENT_ID
VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET=$GOOGLE_SECRET
VITE_OAUTH_PROXY_URL=$OAUTH_PROXY_ENDPOINT

# Lambda Endpoints
VITE_GRAPHQL_HOST=$GRAPHQL_ENDPOINT
VITE_WEBSOCKET_URL=$WEBSOCKET_URL

# Database Configuration (New Unified System)
USE_LOCAL_CREDENTIALS=false
DB_SECRET_NAME=$DB_CREDS_SECRET_NAME
DB_HOST=$DB_HOST_MAIN

# Legacy Database Variables (for backward compatibility)
DB_CREDS_PATH=$DB_CREDS_SECRET_NAME

# Application Secrets
JWT_SECRET=$JWT_SECRET
COOKIE_SECRET=$COOKIE_SECRET

# AWS Configuration
AWS_REGION=$AWS_REGION
RDS_PROXY_ENDPOINT=$RDS_PROXY_ENDPOINT

# SQS Queue URLs
SQS_LOAD_SEASON_STATS_URL=$SQS_LOAD_SEASON_STATS_URL
SQS_AUTOMATIC_DRAFTS_URL=$SQS_AUTOMATIC_DRAFTS_URL
SQS_SELECT_GAME_URL=$SQS_SELECT_GAME_URL
# Legacy support
SQS_QUEUE_URL=$SQS_QUEUE_URL
EOF

# Add direct database endpoint if available
if [ -n "$DB_HOST_DIRECT" ] && [ "$DB_HOST_DIRECT" != "null" ]; then
    echo "DB_HOST_DIRECT=$DB_HOST_DIRECT" >> "$TEMP_ENV"
fi

if [ "$DRY_RUN" = "true" ]; then
    echo "DRY RUN - Would update the following variables:"
    echo ""
    while IFS='=' read -r key value; do
        if [[ $key =~ (PASSWORD|SECRET|TOKEN|_KEY|CREDENTIAL|DATABASE_URL) ]]; then
            masked_value=$(printf '%*s' ${#value} | tr ' ' '*')
            echo "  $key=$masked_value"
        else
            echo "  $key=$value"
        fi
    done < "$TEMP_ENV"
    echo ""
    echo "Run with DRY_RUN=false to apply changes."
    rm "$TEMP_ENV"
    exit 0
fi

echo "Updating .env file..."

# Create a new .env file
NEW_ENV_FILE=$(mktemp)

# Process existing .env file
while IFS= read -r line; do
    # Skip empty lines and comments (preserve them)
    if [[ -z "${line// }" ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
        echo "$line" >> "$NEW_ENV_FILE"
        continue
    fi
    
    # Parse key=value lines
    if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
        key="${BASH_REMATCH[1]// /}"
        old_value="${BASH_REMATCH[2]}"
        
        # Check if we have a new value for this key
        new_value=$(grep "^$key=" "$TEMP_ENV" 2>/dev/null | cut -d'=' -f2- || echo "")
        
        if [ -n "$new_value" ]; then
            # Quote values that contain special characters
            if [[ "$new_value" =~ [#\$\(\)%+\{\}\>\<\&\|\;\`\"\'\ ] ]]; then
                new_value="\"$new_value\""
            fi
            
            echo "$key=$new_value" >> "$NEW_ENV_FILE"
            
            # Show what changed (mask sensitive values)
            if [[ $key =~ (PASSWORD|SECRET|TOKEN|_KEY|CREDENTIAL|DATABASE_URL) ]]; then
                old_masked=$(printf '%*s' ${#old_value} | tr ' ' '*')
                new_masked=$(printf '%*s' ${#new_value} | tr ' ' '*')
                echo "  ✓ Updated $key (masked)"
            else
                echo "  ✓ Updated $key: $old_value -> $new_value"
            fi
        else
            # Keep existing values for keys we don't manage
            echo "$line" >> "$NEW_ENV_FILE"
            echo "  - Preserved: $key"
        fi
    else
        # Keep malformed lines as-is
        echo "$line" >> "$NEW_ENV_FILE"
    fi
done < "$ENV_FILE"

# Replace the original file
mv "$NEW_ENV_FILE" "$ENV_FILE"

# Clean up
rm "$TEMP_ENV"

echo ""
echo "✓ Environment file updated successfully!"
echo ""
echo "Summary (New Unified Credential System):"
echo "  Credential Mode: AWS Secrets Manager (USE_LOCAL_CREDENTIALS=false)"
echo "  Database Secret: $DB_CREDS_SECRET_NAME"
echo "  Database Host: $DB_HOST_MAIN"
echo "  RDS Proxy Endpoint: $RDS_PROXY_ENDPOINT"
echo "  Direct RDS Endpoint: $DB_HOST_DIRECT"
echo "  AWS Region: $AWS_REGION"
echo "  SQS Load Season Stats URL: $SQS_LOAD_SEASON_STATS_URL"
echo "  SQS Automatic Drafts URL: $SQS_AUTOMATIC_DRAFTS_URL"
echo "  Google Client ID: $GOOGLE_CLIENT_ID"
echo "  Secrets configured: JWT, Google OAuth, Cookie"
echo ""
echo "Database Credential Resolution:"
echo "  ✓ Production apps will automatically fetch DB credentials from AWS Secrets Manager"
echo "  ✓ Use 'pnpm run db:test:production' to validate database connectivity"
echo "  ✓ Use 'pnpm run db:credentials:production' to view resolved credentials"
echo ""
echo "Migration Notes:"
echo "  - Set DATABASE_ENDPOINT=direct for database migrations and admin tasks"
echo "  - Set DATABASE_ENDPOINT=proxy (default) for production applications"
echo "  - Local development settings preserved (update .env.local separately)"
