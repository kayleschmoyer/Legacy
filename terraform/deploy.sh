#!/bin/bash

# Legacy Sports Deployment Script
# This script builds Lambda packages and deploys the infrastructure

set -e

# Parse command line arguments
SKIP_BUILD=false
PLAN_ONLY=false
ENVIRONMENT="dev"
TARGET_RESOURCES=()
LIST_TARGETS=false
DISCOVER_RESOURCES=false
RESOURCE_TYPES=("VPC" "Lambda" "RDS" "SQS" "S3" "IAM" "SecretsManager" "ApiGateway")
AUTO_IMPORT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --plan-only)
            PLAN_ONLY=true
            shift
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --target)
            IFS=',' read -ra TARGETS <<< "$2"
            TARGET_RESOURCES+=("${TARGETS[@]}")
            shift 2
            ;;
        --list-targets)
            LIST_TARGETS=true
            shift
            ;;
        --discover-resources)
            DISCOVER_RESOURCES=true
            shift
            ;;
        --resource-types)
            IFS=',' read -ra TYPES <<< "$2"
            RESOURCE_TYPES=("${TYPES[@]}")
            shift 2
            ;;
        --auto-import)
            AUTO_IMPORT=true
            shift
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Define available resource targets for easy reference
declare -A AVAILABLE_TARGETS
AVAILABLE_TARGETS[vpc]="aws_vpc.main aws_internet_gateway.main aws_subnet.public aws_subnet.private_lambda aws_subnet.private_database aws_eip.nat aws_nat_gateway.main aws_route_table.public aws_route_table.private_lambda aws_route_table.private_database aws_route_table_association.public aws_route_table_association.private_lambda aws_route_table_association.private_database"
AVAILABLE_TARGETS[security-groups]="aws_security_group.lambda aws_security_group.rds aws_security_group.rds_proxy aws_security_group.api_gateway"
AVAILABLE_TARGETS[secrets]="random_password.database_password aws_secretsmanager_secret.database_credentials aws_secretsmanager_secret_version.database_credentials aws_secretsmanager_secret.jwt_secret aws_secretsmanager_secret_version.jwt_secret aws_secretsmanager_secret.google_oauth_client_secret aws_secretsmanager_secret_version.google_oauth_client_secret aws_secretsmanager_secret.oauth_proxy_cookie_secret aws_secretsmanager_secret_version.oauth_proxy_cookie_secret"
AVAILABLE_TARGETS[database]="aws_db_subnet_group.main aws_db_instance.postgres aws_iam_role.rds_monitoring aws_iam_role_policy_attachment.rds_monitoring aws_db_proxy.main aws_db_proxy_default_target_group.main aws_db_proxy_target.main aws_iam_role.rds_proxy aws_iam_role_policy.rds_proxy_secrets"
AVAILABLE_TARGETS[sqs]="aws_sqs_queue.load_season_stats_dlq aws_sqs_queue.load_season_stats aws_sqs_queue_policy.load_season_stats"
AVAILABLE_TARGETS[s3]="aws_s3_bucket.lambda_deployments aws_s3_bucket_versioning.lambda_deployments aws_s3_bucket_server_side_encryption_configuration.lambda_deployments aws_s3_bucket_public_access_block.lambda_deployments"
AVAILABLE_TARGETS[lambda-layer]="aws_lambda_layer_version.node_pg"
AVAILABLE_TARGETS[lambda-iam]="aws_iam_role.lambda_execution aws_iam_role_policy_attachment.lambda_basic_execution aws_iam_role_policy_attachment.lambda_vpc_execution aws_iam_role_policy.lambda_secrets_rds aws_iam_role.stats_lambda aws_iam_role_policy_attachment.stats_lambda_basic_execution aws_iam_role_policy.stats_lambda_secrets_rds"
AVAILABLE_TARGETS[lambda-functions]="aws_lambda_function.oauth_google_auth aws_lambda_function.oauth_google_refresh aws_lambda_function.oauth_local_register aws_lambda_function.oauth_local_login aws_lambda_function.graphql aws_lambda_function.stats_load_career aws_lambda_event_source_mapping.stats_sqs"
AVAILABLE_TARGETS[lambda-logs]="aws_cloudwatch_log_group.oauth_google_auth aws_cloudwatch_log_group.oauth_google_refresh aws_cloudwatch_log_group.oauth_local_register aws_cloudwatch_log_group.oauth_local_login aws_cloudwatch_log_group.graphql aws_cloudwatch_log_group.stats_load_career"
AVAILABLE_TARGETS[api-gateway]="aws_api_gateway_rest_api.main aws_api_gateway_deployment.main aws_api_gateway_stage.main aws_api_gateway_gateway_response.cors aws_api_gateway_resource.google aws_api_gateway_resource.google_auth aws_api_gateway_resource.google_refresh aws_api_gateway_resource.local aws_api_gateway_resource.local_register aws_api_gateway_resource.local_login aws_api_gateway_resource.graphql"
AVAILABLE_TARGETS[api-gateway-methods]="aws_api_gateway_method.oauth_google_auth aws_api_gateway_method.oauth_google_auth_options aws_api_gateway_method.oauth_google_refresh aws_api_gateway_method.oauth_google_refresh_options aws_api_gateway_method.oauth_local_register aws_api_gateway_method.oauth_local_register_options aws_api_gateway_method.oauth_local_login aws_api_gateway_method.oauth_local_login_options aws_api_gateway_method.graphql aws_api_gateway_method.graphql_options"
AVAILABLE_TARGETS[api-gateway-integrations]="aws_api_gateway_integration.oauth_google_auth aws_api_gateway_integration.oauth_google_auth_options aws_api_gateway_integration.oauth_google_refresh aws_api_gateway_integration.oauth_google_refresh_options aws_api_gateway_integration.oauth_local_register aws_api_gateway_integration.oauth_local_register_options aws_api_gateway_integration.oauth_local_login aws_api_gateway_integration.oauth_local_login_options aws_api_gateway_integration.graphql aws_api_gateway_integration.graphql_options"
AVAILABLE_TARGETS[lambda-permissions]="aws_lambda_permission.oauth_google_auth aws_lambda_permission.oauth_google_refresh aws_lambda_permission.oauth_local_register aws_lambda_permission.oauth_local_login aws_lambda_permission.graphql"

# Function to display available targets
show_available_targets() {
    echo "📋 Available resource targets:"
    echo ""
    for category in $(printf '%s\n' "${!AVAILABLE_TARGETS[@]}" | sort); do
        echo "  $category"
        for resource in ${AVAILABLE_TARGETS[$category]}; do
            echo "    $resource"
        done
        echo ""
    done
    echo "Usage examples:"
    echo "  ./deploy.sh --target vpc,secrets"
    echo "  ./deploy.sh --target aws_vpc.main,aws_security_group.lambda"
    echo "  ./deploy.sh --list-targets"
}

# Function to discover unmanaged AWS resources
discover_unmanaged_resources() {
    local resource_types=("$@")
    local project_name="legacy-sports"
    local environment="dev"
    
    echo "🔍 Discovering unmanaged AWS resources..."
    echo "  Project: $project_name"
    echo "  Environment: $environment"
    echo "  Resource Types: ${resource_types[*]}"
    echo ""
    
    # Get Terraform state resources
    local terraform_resources=""
    if terraform show -json >/dev/null 2>&1; then
        terraform_resources=$(terraform show -json 2>/dev/null | jq -r '.values.root_module.resources[]? | "\(.type)|\(.name)|\(.address)|\(.values.id // .values.name // .values.function_name // .values.db_instance_identifier)"' 2>/dev/null || echo "")
    fi
    
    local unmanaged_resources=()
    local name_pattern="*$project_name*$environment*"
    
    for resource_type in "${resource_types[@]}"; do
        echo "  Scanning $resource_type resources..."
        
        case "$resource_type" in
            "VPC")
                get_vpc_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "Lambda")
                get_lambda_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "RDS")
                get_rds_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "SQS")
                get_sqs_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "S3")
                get_s3_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "IAM")
                get_iam_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "SecretsManager")
                get_secrets_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
            "ApiGateway")
                get_apigateway_resources "$name_pattern" "$terraform_resources" unmanaged_resources
                ;;
        esac
    done
    
    printf '%s\n' "${unmanaged_resources[@]}"
}

# Helper functions to get AWS resources
get_vpc_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local vpcs=$(aws ec2 describe-vpcs --query "Vpcs[?contains(Tags[?Key=='Name'].Value || [''], '${name_pattern//\*/}')].{Id:VpcId,Name:Tags[?Key=='Name']|[0].Value}" --output json 2>/dev/null | jq -r '.[]? | "aws_vpc|\(.Id)|\(.Name)"' 2>/dev/null || echo "")
        
        while IFS= read -r vpc; do
            if [[ -n "$vpc" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$vpc" | cut -d'|' -f2)"; then
                result_array+=("$vpc")
            fi
        done <<< "$vpcs"
    fi
}

get_lambda_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local functions=$(aws lambda list-functions --query "Functions[?contains(FunctionName, '${name_pattern//\*/}')].{Name:FunctionName}" --output json 2>/dev/null | jq -r '.[]? | "aws_lambda_function|\(.Name)|\(.Name)"' 2>/dev/null || echo "")
        
        while IFS= read -r func; do
            if [[ -n "$func" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$func" | cut -d'|' -f2)"; then
                result_array+=("$func")
            fi
        done <<< "$functions"
    fi
}

get_rds_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local instances=$(aws rds describe-db-instances --query "DBInstances[?contains(DBInstanceIdentifier, '${name_pattern//\*/}')].{Id:DBInstanceIdentifier}" --output json 2>/dev/null | jq -r '.[]? | "aws_db_instance|\(.Id)|\(.Id)"' 2>/dev/null || echo "")
        
        while IFS= read -r instance; do
            if [[ -n "$instance" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$instance" | cut -d'|' -f2)"; then
                result_array+=("$instance")
            fi
        done <<< "$instances"
    fi
}

get_sqs_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local queues=$(aws sqs list-queues --queue-name-prefix "${name_pattern//\*/}" --output json 2>/dev/null | jq -r '.QueueUrls[]? | "aws_sqs_queue|\(split("/")[-1])|\(split("/")[-1])"' 2>/dev/null || echo "")
        
        while IFS= read -r queue; do
            if [[ -n "$queue" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$queue" | cut -d'|' -f2)"; then
                result_array+=("$queue")
            fi
        done <<< "$queues"
    fi
}

get_s3_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local buckets=$(aws s3api list-buckets --query "Buckets[?contains(Name, '${name_pattern//\*/}')].{Name:Name}" --output json 2>/dev/null | jq -r '.[]? | "aws_s3_bucket|\(.Name)|\(.Name)"' 2>/dev/null || echo "")
        
        while IFS= read -r bucket; do
            if [[ -n "$bucket" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$bucket" | cut -d'|' -f2)"; then
                result_array+=("$bucket")
            fi
        done <<< "$buckets"
    fi
}

get_iam_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local roles=$(aws iam list-roles --query "Roles[?contains(RoleName, '${name_pattern//\*/}')].{Name:RoleName}" --output json 2>/dev/null | jq -r '.[]? | "aws_iam_role|\(.Name)|\(.Name)"' 2>/dev/null || echo "")
        
        while IFS= read -r role; do
            if [[ -n "$role" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$role" | cut -d'|' -f2)"; then
                result_array+=("$role")
            fi
        done <<< "$roles"
    fi
}

get_secrets_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local secrets=$(aws secretsmanager list-secrets --query "SecretList[?contains(Name, '${name_pattern//\*/}')].{Name:Name}" --output json 2>/dev/null | jq -r '.[]? | "aws_secretsmanager_secret|\(.Name)|\(.Name)"' 2>/dev/null || echo "")
        
        while IFS= read -r secret; do
            if [[ -n "$secret" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$secret" | cut -d'|' -f2)"; then
                result_array+=("$secret")
            fi
        done <<< "$secrets"
    fi
}

get_apigateway_resources() {
    local name_pattern="$1"
    local terraform_resources="$2"
    local -n result_array=$3
    
    if command -v aws >/dev/null 2>&1; then
        local apis=$(aws apigateway get-rest-apis --query "items[?contains(name, '${name_pattern//\*/}')].{Id:id,Name:name}" --output json 2>/dev/null | jq -r '.[]? | "aws_api_gateway_rest_api|\(.Id)|\(.Name)"' 2>/dev/null || echo "")
        
        while IFS= read -r api; do
            if [[ -n "$api" ]] && ! echo "$terraform_resources" | grep -q "$(echo "$api" | cut -d'|' -f2)"; then
                result_array+=("$api")
            fi
        done <<< "$apis"
    fi
}

show_unmanaged_resources() {
    local resources=("$@")
    
    if [ ${#resources[@]} -eq 0 ]; then
        echo "✅ No unmanaged resources found!"
        return 0
    fi
    
    echo "🚨 Found ${#resources[@]} unmanaged resources:"
    echo ""
    
    # Group by resource type
    declare -A grouped
    for resource in "${resources[@]}"; do
        IFS='|' read -r type id name <<< "$resource"
        grouped["$type"]+="    [$type] $name (ID: $id)"$'\n'
    done
    
    for type in $(printf '%s\n' "${!grouped[@]}" | sort); do
        echo "  $type:"
        echo -n "${grouped[$type]}"
        echo ""
    done
    
    return 1
}

import_resources_interactive() {
    local resources=("$@")
    
    if [ ${#resources[@]} -eq 0 ]; then
        return
    fi
    
    echo "📥 Resource Import Options:"
    echo "  1. Import all resources into Terraform state"
    echo "  2. Import selected resources"
    echo "  3. Generate import commands for manual execution"
    echo "  4. Skip import"
    echo ""
    
    read -p "Select an option (1-4): " choice
    
    case $choice in
        1)
            echo "⚠️  Importing all resources. This will add them to Terraform state."
            read -p "Are you sure? (y/N): " confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                import_all_resources "${resources[@]}"
            fi
            ;;
        2)
            import_selected_resources "${resources[@]}"
            ;;
        3)
            generate_import_commands "${resources[@]}"
            ;;
        4)
            echo "⏭️  Skipping import"
            ;;
        *)
            echo "❌ Invalid option"
            ;;
    esac
}

import_all_resources() {
    local resources=("$@")
    
    for resource in "${resources[@]}"; do
        IFS='|' read -r type id name <<< "$resource"
        local terraform_address=$(get_terraform_address "$type" "$name")
        
        if [[ -n "$terraform_address" ]]; then
            echo "  Importing $name..."
            if terraform import "$terraform_address" "$id" >/dev/null 2>&1; then
                echo "    ✅ Imported successfully"
            else
                echo "    ❌ Import failed"
            fi
        fi
    done
}

import_selected_resources() {
    local resources=("$@")
    
    echo "Select resources to import (enter numbers separated by commas):"
    for i in "${!resources[@]}"; do
        IFS='|' read -r type id name <<< "${resources[$i]}"
        echo "  $((i + 1)). [$type] $name"
    done
    
    read -p "Enter selection: " selection
    IFS=',' read -ra indices <<< "$selection"
    
    for index in "${indices[@]}"; do
        index=$((index - 1))
        if [[ $index -ge 0 && $index -lt ${#resources[@]} ]]; then
            IFS='|' read -r type id name <<< "${resources[$index]}"
            local terraform_address=$(get_terraform_address "$type" "$name")
            
            if [[ -n "$terraform_address" ]]; then
                echo "  Importing $name..."
                if terraform import "$terraform_address" "$id" >/dev/null 2>&1; then
                    echo "    ✅ Imported successfully"
                else
                    echo "    ❌ Import failed"
                fi
            fi
        fi
    done
}

generate_import_commands() {
    local resources=("$@")
    
    echo "📋 Generated import commands:"
    echo ""
    
    local commands=()
    for resource in "${resources[@]}"; do
        IFS='|' read -r type id name <<< "$resource"
        local terraform_address=$(get_terraform_address "$type" "$name")
        
        if [[ -n "$terraform_address" ]]; then
            local command="terraform import $terraform_address $id"
            commands+=("$command")
            echo "  $command"
        fi
    done
    
    # Save to file
    printf '%s\n' "${commands[@]}" > import-commands.txt
    echo ""
    echo "💾 Commands saved to: import-commands.txt"
}

get_terraform_address() {
    local type="$1"
    local name="$2"
    local sanitized_name=$(echo "$name" | sed 's/[^a-zA-Z0-9_]/_/g')
    
    case "$type" in
        "aws_vpc")
            echo "aws_vpc.discovered_$sanitized_name"
            ;;
        "aws_lambda_function")
            echo "aws_lambda_function.discovered_$sanitized_name"
            ;;
        "aws_db_instance")
            echo "aws_db_instance.discovered_$sanitized_name"
            ;;
        "aws_sqs_queue")
            echo "aws_sqs_queue.discovered_$sanitized_name"
            ;;
        "aws_s3_bucket")
            echo "aws_s3_bucket.discovered_$sanitized_name"
            ;;
        "aws_iam_role")
            echo "aws_iam_role.discovered_$sanitized_name"
            ;;
        "aws_secretsmanager_secret")
            echo "aws_secretsmanager_secret.discovered_$sanitized_name"
            ;;
        "aws_api_gateway_rest_api")
            echo "aws_api_gateway_rest_api.discovered_$sanitized_name"
            ;;
        *)
            echo ""
            ;;
    esac
}

if [ "$LIST_TARGETS" = true ]; then
    show_available_targets
    exit 0
fi

# Handle resource discovery
if [ "$DISCOVER_RESOURCES" = true ]; then
    echo "🔍 Discovery Mode: Scanning for unmanaged AWS resources..."
    
    # Check if we're in the terraform directory
    if [ -d "terraform" ]; then
        cd terraform
    fi
    
    # Initialize Terraform if needed
    if [ ! -d ".terraform" ]; then
        echo "  Initializing Terraform..."
        terraform init
    fi
    
    # Discover unmanaged resources
    mapfile -t unmanaged_resources < <(discover_unmanaged_resources "${RESOURCE_TYPES[@]}")
    
    if show_unmanaged_resources "${unmanaged_resources[@]}"; then
        # No unmanaged resources found
        :
    else
        # Handle auto-import or interactive mode
        if [ "$AUTO_IMPORT" = true ] && [ ${#unmanaged_resources[@]} -gt 0 ]; then
            echo "🔄 Auto-import mode enabled"
            import_all_resources "${unmanaged_resources[@]}"
        elif [ ${#unmanaged_resources[@]} -gt 0 ]; then
            import_resources_interactive "${unmanaged_resources[@]}"
        fi
    fi
    
    # Return to original directory and exit
    if [ -f "../package.json" ]; then
        cd ..
    fi
    exit 0
fi

echo "🚀 Starting Legacy Sports deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: This script must be run from the root of the legacy-sports project"
    exit 1
fi

# Check if terraform directory exists
if [ ! -d "terraform" ]; then
    echo "❌ Error: terraform directory not found"
    exit 1
fi

# Create terraform directory for build artifacts if it doesn't exist
mkdir -p terraform/build

if [ "$SKIP_BUILD" = false ]; then
    echo "📦 Building Lambda packages..."

# Build OAuth proxy functions
echo "  Building oauth-proxy..."
cd lambdas/oauth-proxy
npx nx build
# Create deployment package
cp dist/index.js .
zip -r ../../terraform/oauth-proxy.zip index.js package.json
rm -f index.js
cd ../..

# Build GraphQL function
echo "  Building graphql..."
cd lambdas/db
npx nx build
# Create deployment package
cp dist/index.js .
zip -r ../../terraform/graphql-lambda.zip index.js package.json
rm -f index.js
cd ../..

# Build Stats lambda
echo "  Building stats-lambda..."
cd lambdas/stats-lambda
npx nx build
# Create deployment package
cp dist/index.js .
zip -r ../../terraform/stats-lambda.zip index.js package.json
rm -f index.js
cd ../..
# Create node-pg layer
echo "  Creating node-pg layer..."
if [ -d "lambdas/layers/node-pg" ]; then
    cd lambdas/layers
    zip -r ../../terraform/node-pg.zip node-pg/
    cd ../..
else
    echo "⚠️  Warning: node-pg layer directory not found, creating empty layer"
    cd terraform
    echo "# Empty layer" > temp_layer.txt
    zip node-pg.zip temp_layer.txt
    rm temp_layer.txt
    cd ..
fi

echo "✅ Lambda packages built successfully"
fi

# Deploy infrastructure
echo "🏗️  Deploying infrastructure..."
cd terraform

# Prepare target arguments
TARGET_ARGS=()
if [ ${#TARGET_RESOURCES[@]} -gt 0 ]; then
    echo "🎯 Targeting specific resources..."
    
    # Expand category names to individual resources
    EXPANDED_TARGETS=()
    for target in "${TARGET_RESOURCES[@]}"; do
        if [[ -n "${AVAILABLE_TARGETS[$target]}" ]]; then
            echo "  Expanding category '$target'..."
            read -ra CATEGORY_RESOURCES <<< "${AVAILABLE_TARGETS[$target]}"
            EXPANDED_TARGETS+=("${CATEGORY_RESOURCES[@]}")
        else
            # Assume it's a specific resource name
            EXPANDED_TARGETS+=("$target")
        fi
    done
    
    # Build terraform target arguments
    for target in "${EXPANDED_TARGETS[@]}"; do
        TARGET_ARGS+=("-target=$target")
        echo "    Targeting: $target"
    done
    echo ""
fi

# Initialize terraform if needed
if [ ! -d ".terraform" ]; then
    echo "  Initializing Terraform..."
    terraform init
fi

# Plan deployment
echo "  Planning deployment..."
if [ ${#TARGET_ARGS[@]} -gt 0 ]; then
    terraform plan -var-file=terraform.tfvars "${TARGET_ARGS[@]}"
else
    terraform plan -var-file=terraform.tfvars
fi

if [ "$PLAN_ONLY" = true ]; then
    echo "📋 Plan-only mode: Deployment stopped after planning"
    cd ..
    exit 0
fi

# Ask for confirmation
read -p "Do you want to apply these changes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  Applying changes..."
    if [ ${#TARGET_ARGS[@]} -gt 0 ]; then
        terraform apply -var-file=terraform.tfvars -auto-approve "${TARGET_ARGS[@]}"
    else
        terraform apply -var-file=terraform.tfvars -auto-approve
    fi
    
    echo "✅ Infrastructure deployed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Update the Google OAuth client secret in AWS Secrets Manager:"
    echo "   aws secretsmanager put-secret-value --secret-id 'dev/google-oauth-client-secret' --secret-string 'your-secret'"
    echo ""
    echo "2. Initialize the database schema using the provided SQL dump files"
    echo ""
    echo "3. Use the following endpoints:"
    terraform output api_gateway_url
    terraform output api_gateway_graphql_url
    
else
    echo "❌ Deployment cancelled"
    exit 1
fi

cd ..

echo "🎉 Deployment complete!"
