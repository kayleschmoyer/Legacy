# Legacy Sports Deployment Script for Windows PowerShell
# This script builds Lambda packages and deploys the infrastructure

param(
    [switch]$SkipBuild,
    [switch]$PlanOnly,
    [string]$Environment = "dev",
    [string[]]$TargetResources = @(),
    [switch]$ListTargets,
    [switch]$DiscoverResources,
    [string[]]$ResourceTypes = @("VPC", "Lambda", "RDS", "SQS", "S3", "IAM", "SecretsManager", "ApiGateway"),
    [switch]$AutoImport
)

$ErrorActionPreference = "Stop"

# Define available resource targets for easy reference
$AvailableTargets = @{
    "vpc" = @("aws_vpc.main", "aws_internet_gateway.main", "aws_subnet.public", "aws_subnet.private_lambda", "aws_subnet.private_database", "aws_eip.nat", "aws_nat_gateway.main", "aws_route_table.public", "aws_route_table.private_lambda", "aws_route_table.private_database", "aws_route_table_association.public", "aws_route_table_association.private_lambda", "aws_route_table_association.private_database")
    "security-groups" = @("aws_security_group.lambda", "aws_security_group.rds", "aws_security_group.rds_proxy", "aws_security_group.api_gateway")
    "secrets" = @("random_password.database_password", "aws_secretsmanager_secret.database_credentials", "aws_secretsmanager_secret_version.database_credentials", "aws_secretsmanager_secret.jwt_secret", "aws_secretsmanager_secret_version.jwt_secret", "aws_secretsmanager_secret.google_oauth_client_secret", "aws_secretsmanager_secret_version.google_oauth_client_secret", "aws_secretsmanager_secret.oauth_proxy_cookie_secret", "aws_secretsmanager_secret_version.oauth_proxy_cookie_secret")
    "database" = @("aws_db_subnet_group.main", "aws_db_instance.postgres", "aws_iam_role.rds_monitoring", "aws_iam_role_policy_attachment.rds_monitoring", "aws_db_proxy.main", "aws_db_proxy_default_target_group.main", "aws_db_proxy_target.main", "aws_iam_role.rds_proxy", "aws_iam_role_policy.rds_proxy_secrets")
    "sqs" = @("aws_sqs_queue.load_season_stats_dlq", "aws_sqs_queue.load_season_stats", "aws_sqs_queue_policy.load_season_stats")
    "s3" = @("aws_s3_bucket.lambda_deployments", "aws_s3_bucket_versioning.lambda_deployments", "aws_s3_bucket_server_side_encryption_configuration.lambda_deployments", "aws_s3_bucket_public_access_block.lambda_deployments")
    "lambda-layer" = @("aws_lambda_layer_version.node_pg")
    "lambda-iam" = @("aws_iam_role.lambda_execution", "aws_iam_role_policy_attachment.lambda_basic_execution", "aws_iam_role_policy_attachment.lambda_vpc_execution", "aws_iam_role_policy.lambda_secrets_rds", "aws_iam_role.stats_lambda", "aws_iam_role_policy_attachment.stats_lambda_basic_execution", "aws_iam_role_policy.stats_lambda_secrets_rds")
    "lambda-functions" = @("aws_lambda_function.oauth_google_auth", "aws_lambda_function.oauth_google_refresh", "aws_lambda_function.oauth_local_register", "aws_lambda_function.oauth_local_login", "aws_lambda_function.graphql", "aws_lambda_function.stats_load_career", "aws_lambda_event_source_mapping.stats_sqs")
    "lambda-logs" = @("aws_cloudwatch_log_group.oauth_google_auth", "aws_cloudwatch_log_group.oauth_google_refresh", "aws_cloudwatch_log_group.oauth_local_register", "aws_cloudwatch_log_group.oauth_local_login", "aws_cloudwatch_log_group.graphql", "aws_cloudwatch_log_group.stats_load_career")
    "api-gateway" = @("aws_api_gateway_rest_api.main", "aws_api_gateway_deployment.main", "aws_api_gateway_stage.main", "aws_api_gateway_gateway_response.cors", "aws_api_gateway_resource.google", "aws_api_gateway_resource.google_auth", "aws_api_gateway_resource.google_refresh", "aws_api_gateway_resource.local", "aws_api_gateway_resource.local_register", "aws_api_gateway_resource.local_login", "aws_api_gateway_resource.graphql")
    "api-gateway-methods" = @("aws_api_gateway_method.oauth_google_auth", "aws_api_gateway_method.oauth_google_auth_options", "aws_api_gateway_method.oauth_google_refresh", "aws_api_gateway_method.oauth_google_refresh_options", "aws_api_gateway_method.oauth_local_register", "aws_api_gateway_method.oauth_local_register_options", "aws_api_gateway_method.oauth_local_login", "aws_api_gateway_method.oauth_local_login_options", "aws_api_gateway_method.graphql", "aws_api_gateway_method.graphql_options")
    "api-gateway-integrations" = @("aws_api_gateway_integration.oauth_google_auth", "aws_api_gateway_integration.oauth_google_auth_options", "aws_api_gateway_integration.oauth_google_refresh", "aws_api_gateway_integration.oauth_google_refresh_options", "aws_api_gateway_integration.oauth_local_register", "aws_api_gateway_integration.oauth_local_register_options", "aws_api_gateway_integration.oauth_local_login", "aws_api_gateway_integration.oauth_local_login_options", "aws_api_gateway_integration.graphql", "aws_api_gateway_integration.graphql_options")
    "lambda-permissions" = @("aws_lambda_permission.oauth_google_auth", "aws_lambda_permission.oauth_google_refresh", "aws_lambda_permission.oauth_local_register", "aws_lambda_permission.oauth_local_login", "aws_lambda_permission.graphql")
}

# Function to display available targets
function Show-AvailableTargets {
    Write-Host "Available resource targets:" -ForegroundColor Yellow
    Write-Host ""
    foreach ($category in $AvailableTargets.Keys | Sort-Object) {
        Write-Host "  $category" -ForegroundColor Cyan
        $AvailableTargets[$category] | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        Write-Host ""
    }
    Write-Host "Usage examples:" -ForegroundColor Yellow
    Write-Host "  .\deploy.ps1 -TargetResources vpc,secrets" -ForegroundColor Gray
    Write-Host "  .\deploy.ps1 -TargetResources aws_vpc.main,aws_security_group.lambda" -ForegroundColor Gray
    Write-Host "  .\deploy.ps1 -ListTargets" -ForegroundColor Gray
}

# Function to discover unmanaged AWS resources
function Discover-UnmanagedResources {
    param(
        [string[]]$ResourceTypes,
        [string]$ProjectName = "legacy-sports",
        [string]$Environment = "dev"
    )
    
    Write-Host "Discovering unmanaged AWS resources..." -ForegroundColor Yellow
    Write-Host "  Project: $ProjectName" -ForegroundColor Gray
    Write-Host "  Environment: $Environment" -ForegroundColor Gray
    Write-Host "  Resource Types: $($ResourceTypes -join ', ')" -ForegroundColor Gray
    Write-Host ""
    
    # Get Terraform state resources
    $terraformResources = @()
    try {
        $stateOutput = terraform show -json 2>$null | ConvertFrom-Json
        if ($stateOutput -and $stateOutput.values -and $stateOutput.values.root_module -and $stateOutput.values.root_module.resources) {
            $terraformResources = $stateOutput.values.root_module.resources | ForEach-Object { 
                @{
                    Type = $_.type
                    Name = $_.name
                    Address = $_.address
                    Values = $_.values
                }
            }
        }
    }
    catch {
        Write-Host "WARNING: Could not read Terraform state. Continuing with discovery..." -ForegroundColor Yellow
    }
    
    $unmanagedResources = @()
    $namePattern = "*$ProjectName*$Environment*"
    
    foreach ($resourceType in $ResourceTypes) {
        Write-Host "  Scanning $resourceType resources..." -ForegroundColor Cyan
        
        switch ($resourceType) {
            "VPC" {
                $awsResources = Get-VPCResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "VPC"
            }
            "Lambda" {
                $awsResources = Get-LambdaResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "Lambda"
            }
            "RDS" {
                $awsResources = Get-RDSResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "RDS"
            }
            "SQS" {
                $awsResources = Get-SQSResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "SQS"
            }
            "S3" {
                $awsResources = Get-S3Resources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "S3"
            }
            "IAM" {
                $awsResources = Get-IAMResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "IAM"
            }
            "SecretsManager" {
                $awsResources = Get-SecretsManagerResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "SecretsManager"
            }
            "ApiGateway" {
                $awsResources = Get-ApiGatewayResources -NamePattern $namePattern
                $unmanagedResources += Compare-Resources -AWSResources $awsResources -TerraformResources $terraformResources -ResourceType "ApiGateway"
            }
        }
    }
    
    return $unmanagedResources
}

# Helper functions to get AWS resources
function Get-VPCResources {
    param([string]$NamePattern)
    
    try {
        $vpcs = aws ec2 describe-vpcs --query "Vpcs[?contains(Tags[?Key=='Name'].Value, '$($NamePattern.Replace('*', ''))')].{Id:VpcId,Name:Tags[?Key=='Name']|[0].Value}" --output json | ConvertFrom-Json
        return $vpcs | ForEach-Object { @{ Type = "aws_vpc"; Id = $_.Id; Name = $_.Name } }
    }
    catch {
        Write-Host "    WARNING: Could not query VPC resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-LambdaResources {
    param([string]$NamePattern)
    
    try {
        $functions = aws lambda list-functions --query "Functions[?contains(FunctionName, '$($NamePattern.Replace('*', ''))')].{Name:FunctionName,Arn:FunctionArn}" --output json | ConvertFrom-Json
        return $functions | ForEach-Object { @{ Type = "aws_lambda_function"; Id = $_.Name; Name = $_.Name } }
    }
    catch {
        Write-Host "    WARNING: Could not query Lambda resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-RDSResources {
    param([string]$NamePattern)
    
    try {
        $instances = aws rds describe-db-instances --query "DBInstances[?contains(DBInstanceIdentifier, '$($NamePattern.Replace('*', ''))')].{Id:DBInstanceIdentifier,Engine:Engine}" --output json | ConvertFrom-Json
        return $instances | ForEach-Object { @{ Type = "aws_db_instance"; Id = $_.Id; Name = $_.Id } }
    }
    catch {
        Write-Host "    WARNING: Could not query RDS resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-SQSResources {
    param([string]$NamePattern)
    
    try {
        $queues = aws sqs list-queues --query "QueueUrls[?contains(@, '$($NamePattern.Replace('*', ''))')].{Url:@}" --output json | ConvertFrom-Json
        return $queues | ForEach-Object { 
            $queueName = $_.Url.Split('/')[-1]
            @{ Type = "aws_sqs_queue"; Id = $queueName; Name = $queueName }
        }
    }
    catch {
        Write-Host "    WARNING: Could not query SQS resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-S3Resources {
    param([string]$NamePattern)
    
    try {
        $buckets = aws s3api list-buckets --query "Buckets[?contains(Name, '$($NamePattern.Replace('*', ''))')].{Name:Name}" --output json | ConvertFrom-Json
        return $buckets | ForEach-Object { @{ Type = "aws_s3_bucket"; Id = $_.Name; Name = $_.Name } }
    }
    catch {
        Write-Host "    WARNING: Could not query S3 resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-IAMResources {
    param([string]$NamePattern)
    
    try {
        $roles = aws iam list-roles --query "Roles[?contains(RoleName, '$($NamePattern.Replace('*', ''))')].{Name:RoleName}" --output json | ConvertFrom-Json
        return $roles | ForEach-Object { @{ Type = "aws_iam_role"; Id = $_.Name; Name = $_.Name } }
    }
    catch {
        Write-Host "    WARNING: Could not query IAM resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-SecretsManagerResources {
    param([string]$NamePattern)
    
    try {
        $secrets = aws secretsmanager list-secrets --query "SecretList[?contains(Name, '$($NamePattern.Replace('*', ''))')].{Name:Name,Arn:ARN}" --output json | ConvertFrom-Json
        return $secrets | ForEach-Object { @{ Type = "aws_secretsmanager_secret"; Id = $_.Name; Name = $_.Name } }
    }
    catch {
        Write-Host "    WARNING: Could not query Secrets Manager resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Get-ApiGatewayResources {
    param([string]$NamePattern)
    
    try {
        $apis = aws apigateway get-rest-apis --query "items[?contains(name, '$($NamePattern.Replace('*', ''))')].{Id:id,Name:name}" --output json | ConvertFrom-Json
        return $apis | ForEach-Object { @{ Type = "aws_api_gateway_rest_api"; Id = $_.Id; Name = $_.Name } }
    }
    catch {
        Write-Host "    WARNING: Could not query API Gateway resources: $($_.Exception.Message)" -ForegroundColor Yellow
        return @()
    }
}

function Compare-Resources {
    param(
        [array]$AWSResources,
        [array]$TerraformResources,
        [string]$ResourceType
    )
    
    $unmanaged = @()
    
    foreach ($awsResource in $AWSResources) {
        $managed = $false
        
        foreach ($tfResource in $TerraformResources) {
            # Check if AWS resource is managed by Terraform
            if ($tfResource.Type -eq $awsResource.Type) {
                # Compare by ID/name
                if ($tfResource.Values.id -eq $awsResource.Id -or 
                    $tfResource.Values.name -eq $awsResource.Name -or
                    $tfResource.Values.function_name -eq $awsResource.Name -or
                    $tfResource.Values.db_instance_identifier -eq $awsResource.Name) {
                    $managed = $true
                    break
                }
            }
        }
        
        if (-not $managed) {
            $unmanaged += @{
                Type = $awsResource.Type
                Id = $awsResource.Id
                Name = $awsResource.Name
                ResourceType = $ResourceType
            }
        }
    }
    
    return $unmanaged
}

function Show-UnmanagedResources {
    param([array]$UnmanagedResources)
    
    if ($UnmanagedResources.Count -eq 0) {
        Write-Host "No unmanaged resources found!" -ForegroundColor Green
        return
    }
    
    Write-Host "Found $($UnmanagedResources.Count) unmanaged resources:" -ForegroundColor Red
    Write-Host ""
    
    $groupedResources = $UnmanagedResources | Group-Object ResourceType
    
    foreach ($group in $groupedResources) {
        Write-Host "  $($group.Name):" -ForegroundColor Yellow
        foreach ($resource in $group.Group) {
            Write-Host "    [$($resource.Type)] $($resource.Name) (ID: $($resource.Id))" -ForegroundColor Gray
        }
        Write-Host ""
    }
    
    return $UnmanagedResources
}

function Import-ResourcesInteractive {
    param([array]$UnmanagedResources)
    
    if ($UnmanagedResources.Count -eq 0) {
        return
    }
    
    Write-Host "Resource Import Options:" -ForegroundColor Yellow
    Write-Host "  1. Import all resources into Terraform state" -ForegroundColor Gray
    Write-Host "  2. Import selected resources" -ForegroundColor Gray
    Write-Host "  3. Generate import commands for manual execution" -ForegroundColor Gray
    Write-Host "  4. Skip import" -ForegroundColor Gray
    Write-Host ""
    
    $choice = Read-Host "Select an option (1-4)"
    
    switch ($choice) {
        "1" {
        Write-Host "WARNING: Importing all resources. This will add them to Terraform state." -ForegroundColor Yellow
            $confirm = Read-Host "Are you sure? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Import-AllResources -Resources $UnmanagedResources
            }
        }
        "2" {
            Import-SelectedResources -Resources $UnmanagedResources
        }
        "3" {
            Generate-ImportCommands -Resources $UnmanagedResources
        }
        "4" {
            Write-Host "Skipping import" -ForegroundColor Gray
        }
        default {
            Write-Host "Invalid option" -ForegroundColor Red
        }
    }
}

function Import-AllResources {
    param([array]$Resources)
    
    foreach ($resource in $Resources) {
        $terraformAddress = Get-TerraformAddress -Resource $resource
        if ($terraformAddress) {
            Write-Host "  Importing $($resource.Name)..." -ForegroundColor Cyan
            try {
                terraform import $terraformAddress $resource.Id
                Write-Host "    Imported successfully" -ForegroundColor Green
            }
            catch {
                Write-Host "    Import failed: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

function Import-SelectedResources {
    param([array]$Resources)
    
    Write-Host "Select resources to import (enter numbers separated by commas):" -ForegroundColor Yellow
    for ($i = 0; $i -lt $Resources.Count; $i++) {
        Write-Host "  $($i + 1). [$($Resources[$i].Type)] $($Resources[$i].Name)" -ForegroundColor Gray
    }
    
    $selection = Read-Host "Enter selection"
    $indices = $selection.Split(',') | ForEach-Object { [int]$_.Trim() - 1 }
    
    foreach ($index in $indices) {
        if ($index -ge 0 -and $index -lt $Resources.Count) {
            $resource = $Resources[$index]
            $terraformAddress = Get-TerraformAddress -Resource $resource
            if ($terraformAddress) {
                Write-Host "  Importing $($resource.Name)..." -ForegroundColor Cyan
                try {
                    terraform import $terraformAddress $resource.Id
                    Write-Host "    Imported successfully" -ForegroundColor Green
                }
                catch {
                    Write-Host "    Import failed: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    }
}

function Generate-ImportCommands {
    param([array]$Resources)
    
    Write-Host "Generated import commands:" -ForegroundColor Yellow
    Write-Host ""
    
    $commands = @()
    foreach ($resource in $Resources) {
        $terraformAddress = Get-TerraformAddress -Resource $resource
        if ($terraformAddress) {
            $command = "terraform import $terraformAddress $($resource.Id)"
            $commands += $command
            Write-Host "  $command" -ForegroundColor Gray
        }
    }
    
    # Save to file
    $commandsFile = "import-commands.txt"
    $commands | Out-File -FilePath $commandsFile -Encoding UTF8
    Write-Host ""
    Write-Host "Commands saved to: $commandsFile" -ForegroundColor Green
}

function Get-TerraformAddress {
    param([hashtable]$Resource)
    
    # Generate Terraform resource address based on type and name
    $sanitizedName = $Resource.Name -replace '[^a-zA-Z0-9_]', '_'
    
    switch ($Resource.Type) {
        "aws_vpc" { return "aws_vpc.discovered_$sanitizedName" }
        "aws_lambda_function" { return "aws_lambda_function.discovered_$sanitizedName" }
        "aws_db_instance" { return "aws_db_instance.discovered_$sanitizedName" }
        "aws_sqs_queue" { return "aws_sqs_queue.discovered_$sanitizedName" }
        "aws_s3_bucket" { return "aws_s3_bucket.discovered_$sanitizedName" }
        "aws_iam_role" { return "aws_iam_role.discovered_$sanitizedName" }
        "aws_secretsmanager_secret" { return "aws_secretsmanager_secret.discovered_$sanitizedName" }
        "aws_api_gateway_rest_api" { return "aws_api_gateway_rest_api.discovered_$sanitizedName" }
        default {
            Write-Host "WARNING: Unknown resource type: $($Resource.Type)" -ForegroundColor Yellow
            return $null
        }
    }
}

if ($ListTargets) {
    Show-AvailableTargets
    exit 0
}

# Handle resource discovery
if ($DiscoverResources) {
    Write-Host "Discovery Mode: Scanning for unmanaged AWS resources..." -ForegroundColor Yellow
    
    # Check AWS credentials first
    try {
        $null = aws sts get-caller-identity 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "AWS credentials not available"
        }
    }
    catch {
        Write-Host "Error: AWS credentials are not configured or have expired." -ForegroundColor Red
        Write-Host "Please run 'aws sso login --profile <your-profile>' or configure AWS credentials." -ForegroundColor Yellow
        Write-Host "Current AWS configuration:" -ForegroundColor Gray
        aws configure list
        exit 1
    }
    
    # Check if we're in the terraform directory
    if (Test-Path "terraform") {
        Set-Location "terraform"
    }
    
    # Initialize Terraform if needed
    if (-not (Test-Path ".terraform")) {
        Write-Host "  Initializing Terraform..." -ForegroundColor Cyan
        terraform init
    }
    
    # Discover unmanaged resources
    $unmanagedResources = Discover-UnmanagedResources -ResourceTypes $ResourceTypes
    $displayedResources = Show-UnmanagedResources -UnmanagedResources $unmanagedResources
    
    # Handle auto-import or interactive mode
    if ($AutoImport -and $displayedResources.Count -gt 0) {
        Write-Host "Auto-import mode enabled" -ForegroundColor Yellow
        Import-AllResources -Resources $displayedResources
    } elseif ($displayedResources.Count -gt 0) {
        Import-ResourcesInteractive -Resources $displayedResources
    }
    
    # Return to original directory and exit
    if (Test-Path "..") {
        Set-Location ".."
    }
    exit 0
}

Write-Host "Starting Legacy Sports deployment..." -ForegroundColor Green

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: This script must be run from the root of the legacy-sports project" -ForegroundColor Red
    exit 1
}

# Check if terraform directory exists
if (-not (Test-Path "terraform")) {
    Write-Host "Error: terraform directory not found" -ForegroundColor Red
    exit 1
}

# Create terraform directory for build artifacts if it doesn't exist
if (-not (Test-Path "terraform\build")) {
    New-Item -ItemType Directory -Path "terraform\build" -Force | Out-Null
}

if (-not $SkipBuild) {
    Write-Host "Building Lambda packages..." -ForegroundColor Yellow

    # Build OAuth proxy functions
    Write-Host "  Building oauth-proxy..." -ForegroundColor Cyan
    Set-Location "lambdas\oauth-proxy"
    npx nx build
    # Create deployment package
    Copy-Item "dist\index.js" "."
    Compress-Archive -Path "index.js","package.json" -DestinationPath "..\..\terraform\oauth-proxy.zip" -Force
    Remove-Item "index.js" -ErrorAction SilentlyContinue
    Set-Location "..\..\"

    # Build GraphQL function
    Write-Host "  Building graphql..." -ForegroundColor Cyan
    Set-Location "lambdas\db"
    npx nx build
    # Create deployment package
    Copy-Item "dist\index.js" "."
    Compress-Archive -Path "index.js","package.json" -DestinationPath "..\..\terraform\graphql-lambda.zip" -Force
    Remove-Item "index.js" -ErrorAction SilentlyContinue
    Set-Location "..\..\"

    # Build Stats lambda
    Write-Host "  Building stats-lambda..." -ForegroundColor Cyan
    Set-Location "lambdas\stats-lambda"
    npx nx build
    # Create deployment package
    Copy-Item "dist\index.js" "."
    Compress-Archive -Path "index.js","package.json" -DestinationPath "..\..\terraform\stats-lambda.zip" -Force
    Remove-Item "index.js" -ErrorAction SilentlyContinue
    Set-Location "..\..\"



    Write-Host "Lambda packages built successfully" -ForegroundColor Green
}

# Deploy infrastructure
Write-Host "Deploying infrastructure..." -ForegroundColor Yellow
Set-Location "terraform"

# Prepare target arguments
$targetArgs = @()
if ($TargetResources.Count -gt 0) {
    Write-Host "Targeting specific resources..." -ForegroundColor Cyan
    
    # Expand category names to individual resources
    $expandedTargets = @()
    foreach ($target in $TargetResources) {
        if ($AvailableTargets.ContainsKey($target)) {
            Write-Host "  Expanding category '$target'..." -ForegroundColor Gray
            $expandedTargets += $AvailableTargets[$target]
        } else {
            # Assume it's a specific resource name
            $expandedTargets += $target
        }
    }
    
    # Build terraform target arguments
    foreach ($target in $expandedTargets) {
        $targetArgs += "-target=$target"
        Write-Host "    Targeting: $target" -ForegroundColor Gray
    }
    Write-Host ""
}

# Initialize terraform if needed
if (-not (Test-Path ".terraform")) {
    Write-Host "  Initializing Terraform..." -ForegroundColor Cyan
    terraform init
}

# Plan deployment
Write-Host "  Planning deployment..." -ForegroundColor Cyan
if ($targetArgs.Count -gt 0) {
    terraform plan -var-file "terraform.tfvars" @targetArgs
} else {
    terraform plan -var-file "terraform.tfvars"
}

if ($PlanOnly) {
    Write-Host "Plan-only mode: Deployment stopped after planning" -ForegroundColor Yellow
    Set-Location ".."
    exit 0
}

# Ask for confirmation
$confirmation = Read-Host "Do you want to apply these changes? (y/N)"
if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
    Write-Host "  Applying changes..." -ForegroundColor Cyan
    if ($targetArgs.Count -gt 0) {
        terraform apply -var-file "terraform.tfvars" -auto-approve @targetArgs
    } else {
        terraform apply -var-file "terraform.tfvars" -auto-approve
    }
    
    Write-Host "Infrastructure deployed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Update the Google OAuth client secret in AWS Secrets Manager:"
    Write-Host "   aws secretsmanager put-secret-value --secret-id 'dev/google-oauth-client-secret' --secret-string 'your-secret'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Initialize the database schema using the provided SQL dump files" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Lambda functions are deployed automatically via Terraform" -ForegroundColor Gray
    
} else {
    Write-Host "Deployment cancelled" -ForegroundColor Red
    Set-Location ".."
    exit 1
}

Set-Location ".."

Write-Host "Deployment complete!" -ForegroundColor Green
