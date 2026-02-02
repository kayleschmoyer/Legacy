# Legacy Sports Environment Variables Sync Script (PowerShell)
# This script pulls environment variables from AWS and updates the .env file
#
# New Unified Database Credential Strategy:
# - USE_LOCAL_CREDENTIALS=false (use AWS Secrets Manager for production)
# - DB_SECRET_NAME: Points to AWS Secrets Manager secret
# - DB_HOST: Database endpoint (proxy preferred for production)
# - Credentials are automatically resolved by the new credential system
#
# Special Character Handling:
# - Automatically escapes dollar signs ($) in secrets for proper dotenv parsing
# - Adds SSL configuration for secure database connections

param(
    [string]$Environment = "dev",
    [string]$TerraformDir = "terraform",
    [string]$EnvFile = ".env",
    [switch]$DryRun,
    [switch]$Backup,
    [ValidateSet("proxy", "direct")]
    [string]$DatabaseEndpoint = "proxy"  # Use proxy endpoint for production by default
)

$ErrorActionPreference = "Stop"

Write-Host "Legacy Sports Environment Sync" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path $TerraformDir)) {
    Write-Error "Terraform directory not found. Please run this script from the project root."
}

if (-not (Test-Path $EnvFile)) {
    Write-Error ".env file not found. Please run this script from the project root."
}

# Backup existing .env file if requested
if ($Backup) {
    $backupFile = "$EnvFile.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $EnvFile $backupFile
    Write-Host "Backed up existing .env file to $backupFile" -ForegroundColor Green
}

Write-Host "Fetching Terraform outputs..." -ForegroundColor Yellow
Push-Location $TerraformDir
try {
    $terraformOutput = terraform output -json | ConvertFrom-Json
} catch {
    Write-Error "Failed to get Terraform outputs. Make sure Terraform is applied."
} finally {
    Pop-Location
}

Write-Host "Fetching secrets from AWS..." -ForegroundColor Yellow

# Note: With the new credential system, we store the secret NAME, not the actual credentials
# This allows the credential resolver to fetch them securely at runtime

$dbCredsSecretName = $terraformOutput.environment_variables_summary.value.db_creds_secret_name
Write-Host "  Database secret name: $dbCredsSecretName (will be resolved at runtime)" -ForegroundColor Gray

# Get JWT secret
$jwtSecretName = $terraformOutput.environment_variables_summary.value.jwt_secret_name
Write-Host "  JWT secret from: $jwtSecretName" -ForegroundColor Gray
$jwtSecret = aws secretsmanager get-secret-value --secret-id $jwtSecretName --query "SecretString" --output text

# Get Google OAuth client secret
$googleSecretName = $terraformOutput.environment_variables_summary.value.google_oauth_client_secret_name
Write-Host "  Google OAuth secret from: $googleSecretName" -ForegroundColor Gray
$googleSecret = aws secretsmanager get-secret-value --secret-id $googleSecretName --query "SecretString" --output text

# Get OAuth proxy cookie secret
$cookieSecretName = $terraformOutput.environment_variables_summary.value.oauth_proxy_cookie_secret_name
Write-Host "  Cookie secret from: $cookieSecretName" -ForegroundColor Gray
$cookieSecret = aws secretsmanager get-secret-value --secret-id $cookieSecretName --query "SecretString" --output text

Write-Host ""
Write-Host "Building environment variables..." -ForegroundColor Yellow

# Build the new environment variables (New Unified Credential System)
$newEnvVars = @{}

# OAuth Configuration
$newEnvVars["EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID"] = $terraformOutput.environment_variables_summary.value.google_oauth_client_id
$newEnvVars["CLIENT_ID"] = $terraformOutput.environment_variables_summary.value.google_oauth_client_id
$newEnvVars["VITE_GOOGLE_CLIENT_ID"] = $terraformOutput.environment_variables_summary.value.google_oauth_client_id
$newEnvVars["GOOGLE_OAUTH_CLIENT_SECRET"] = $googleSecret
$newEnvVars["VITE_OAUTH_PROXY_URL"] = $terraformOutput.oauth_proxy_endpoint.value

# Lambda Endpoints
$newEnvVars["VITE_GRAPHQL_HOST"] = $terraformOutput.graphql_endpoint.value
$newEnvVars["INTERNAL_API_BASE_URL"] = $terraformOutput.api_gateway_url.value

# Database Configuration (New Unified System)
$newEnvVars["USE_LOCAL_CREDENTIALS"] = "false"
$newEnvVars["DB_SECRET_NAME"] = $dbCredsSecretName
$newEnvVars["DB_CERT_PATH"] = "certs/us-east-1-bundle.pem"

# Legacy Database Variables (for backward compatibility)
$newEnvVars["DB_CREDS_PATH"] = $dbCredsSecretName

# Application Secrets
$newEnvVars["JWT_SECRET"] = $jwtSecret
$newEnvVars["COOKIE_SECRET"] = $cookieSecret

# AWS Configuration
$newEnvVars["AWS_REGION"] = $terraformOutput.environment_variables_summary.value.aws_region
$newEnvVars["RDS_PROXY_ENDPOINT"] = $terraformOutput.rds_proxy_endpoint.value
$newEnvVars["SQS_LOAD_SEASON_STATS_URL"] = $terraformOutput.environment_variables_summary.value.sqs_load_season_stats_url
$newEnvVars["SQS_AUTOMATIC_DRAFTS_URL"] = $terraformOutput.environment_variables_summary.value.sqs_automatic_drafts_url
# Legacy support
$newEnvVars["SQS_QUEUE_URL"] = $terraformOutput.environment_variables_summary.value.sqs_load_season_stats_url

# Fetch database credentials for DATABASE_URL generation AND direct access
Write-Host "Fetching database credentials to generate DATABASE_URL..." -ForegroundColor Yellow
try {
    $dbSecret = aws secretsmanager get-secret-value --secret-id $dbCredsSecretName --query "SecretString" --output text | ConvertFrom-Json
    $dbUsername = $dbSecret.username
    $dbPassword = $dbSecret.password
    Write-Host "  [OK] Database credentials retrieved" -ForegroundColor Green
    
    # Add credentials to environment variables for tools that need them
    # These will be properly escaped when written to the file
    $newEnvVars["DB_USER"] = $dbUsername
    $newEnvVars["DB_PASSWORD"] = $dbPassword
} catch {
    Write-Warning "Could not retrieve database credentials from Secrets Manager. DATABASE_URL will not be set."
    $dbUsername = $null
    $dbPassword = $null
}

# Get direct database endpoint for migrations (if available)
try {
    Push-Location $TerraformDir
    $directDbEndpoint = terraform output -raw rds_instance_endpoint
    Pop-Location
    
    # Strip port if present (format: host:port)
    $directDbHost = $directDbEndpoint -replace ':.*$', ''
    $newEnvVars["DB_HOST_DIRECT"] = $directDbHost
    
    # Set main DB_HOST based on user preference and availability
    if ($DatabaseEndpoint -eq "direct") {
        $newEnvVars["DB_HOST"] = $directDbHost
        Write-Host "Using direct database endpoint for DB_HOST (CLI and migrations)" -ForegroundColor Green
    } else {
        # For CLI/development, use direct RDS access (publicly accessible)
        $newEnvVars["DB_HOST"] = $directDbHost
        Write-Host "Using direct RDS access for DB_HOST (CLI development - publicly accessible)" -ForegroundColor Green
        Write-Host "Note: Lambdas continue using RDS Proxy for production reliability" -ForegroundColor Yellow
    }
    
    # Generate DATABASE_URL if we have credentials
    if ($dbUsername -and $dbPassword -and $directDbHost) {
        # URL-encode the password to handle special characters
        $encodedPassword = [System.Uri]::EscapeDataString($dbPassword)
        $newEnvVars["DATABASE_URL"] = "postgresql://${dbUsername}:${encodedPassword}@${directDbHost}:5432/postgres?sslmode=require"
        Write-Host "  [OK] DATABASE_URL generated" -ForegroundColor Green
    }
} catch {
    Pop-Location
    Write-Warning "Could not retrieve direct database endpoint."
    
    # Fallback to direct RDS access if available
    if ($directDbHost) {
        $newEnvVars["DB_HOST"] = $directDbHost
        Write-Host "Using direct RDS access for DB_HOST (CLI development)" -ForegroundColor Green
        
        # Generate DATABASE_URL if we have credentials
        if ($dbUsername -and $dbPassword) {
            $encodedPassword = [System.Uri]::EscapeDataString($dbPassword)
            $newEnvVars["DATABASE_URL"] = "postgresql://${dbUsername}:${encodedPassword}@${directDbHost}:5432/postgres?sslmode=require"
            Write-Host "  [OK] DATABASE_URL generated" -ForegroundColor Green
        }
    } else {
        # Final fallback to production proxy if direct access fails
        $proxyEndpoint = $terraformOutput.environment_variables_summary.value.db_host
        $proxyHost = $proxyEndpoint -replace ':.*$', ''
        $newEnvVars["DB_HOST"] = $proxyHost
        Write-Host "Fallback: Using production RDS proxy endpoint for DB_HOST" -ForegroundColor Yellow
        
        # Generate DATABASE_URL with proxy endpoint if we have credentials
        if ($dbUsername -and $dbPassword) {
            $encodedPassword = [System.Uri]::EscapeDataString($dbPassword)
            $newEnvVars["DATABASE_URL"] = "postgresql://${dbUsername}:${encodedPassword}@${proxyHost}:5432/postgres?sslmode=require"
            Write-Host "  [OK] DATABASE_URL generated with proxy endpoint" -ForegroundColor Green
        }
    }
}

if ($DryRun) {
    Write-Host "DRY RUN - Would update the following variables:" -ForegroundColor Magenta
    Write-Host ""
    foreach ($key in $newEnvVars.Keys | Sort-Object) {
        $value = $newEnvVars[$key]
        if ($key -match "(PASSWORD|SECRET)") {
            $maskedValue = "*" * $value.Length
            Write-Host "  $key=$maskedValue" -ForegroundColor Gray
        } else {
            Write-Host "  $key=$value" -ForegroundColor Gray
        }
    }
    Write-Host ""
    Write-Host "Run without -DryRun to apply changes." -ForegroundColor Yellow
    exit 0
}

Write-Host "Updating .env file..." -ForegroundColor Yellow

# Read existing .env file
$envLines = Get-Content $EnvFile
$newContent = @()
$updatedKeys = @()

foreach ($line in $envLines) {
    $trimmedLine = $line.Trim()
    
    # Skip empty lines and comments (preserve them)
    if ([string]::IsNullOrWhiteSpace($trimmedLine) -or $trimmedLine.StartsWith("#")) {
        $newContent += $line
        continue
    }
    
    # Parse key=value lines
    if ($trimmedLine.Contains("=")) {
        $equalIndex = $trimmedLine.IndexOf("=")
        $key = $trimmedLine.Substring(0, $equalIndex).Trim()
        $oldValue = $trimmedLine.Substring($equalIndex + 1).Trim()
        
        if ($newEnvVars.ContainsKey($key)) {
            $newValue = $newEnvVars[$key]
            
            # Special handling for password - escape dollar signs for dotenv parsing
            if ($key -eq "DB_PASSWORD") {
                $newValue = $newValue -replace '\$', '\$'
                $newValue = "`"$newValue`""
            }
            # Quote values that contain special characters
            elseif ($newValue -match '[#$()%+{}><&|;`"'' ]') {
                $newValue = "`"$newValue`""
            }
            
            $newContent += "$key=$newValue"
            $updatedKeys += $key
            
            # Show what changed (mask sensitive values)
            if ($key -match "(PASSWORD|SECRET)") {
                Write-Host "  Updated $key (masked)" -ForegroundColor Green
            } else {
                Write-Host "  Updated $key" -ForegroundColor Green
            }
        } else {
            # Keep existing values for keys we don't manage
            $newContent += $line
            Write-Host "  Preserved: $key" -ForegroundColor Gray
        }
    } else {
        # Keep malformed lines as-is
        $newContent += $line
    }
}

# Add any new keys that weren't in the original file
foreach ($key in $newEnvVars.Keys) {
    if ($updatedKeys -notcontains $key) {
        $newValue = $newEnvVars[$key]
        
        # Special handling for password - escape dollar signs for dotenv parsing
        if ($key -eq "DB_PASSWORD") {
            $newValue = $newValue -replace '\$', '\$'
            $newValue = "`"$newValue`""
        }
        # Quote values that contain special characters
        elseif ($newValue -match '[#$()%+{}><&|;`"'' ]') {
            $newValue = "`"$newValue`""
        }
        
        $newContent += "$key=$newValue"
        Write-Host "  Added new: $key" -ForegroundColor Cyan
    }
}

# Write the updated content
$newContent | Out-File -FilePath $EnvFile -Encoding UTF8

Write-Host ""
Write-Host "Environment file updated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary (New Unified Credential System):" -ForegroundColor Yellow
Write-Host "  Credential Mode: AWS Secrets Manager (USE_LOCAL_CREDENTIALS=false)" -ForegroundColor Gray
Write-Host "  Database Secret: $($newEnvVars["DB_SECRET_NAME"])" -ForegroundColor Gray
Write-Host "  Database Host: $($newEnvVars["DB_HOST"])" -ForegroundColor Gray
if ($newEnvVars.ContainsKey("DATABASE_URL")) {
    $maskedUrl = $newEnvVars["DATABASE_URL"] -replace ':[^:@]+@', ':****@'
    Write-Host "  Database URL: $maskedUrl" -ForegroundColor Gray
}
Write-Host "  RDS Proxy Endpoint: $($terraformOutput.rds_proxy_endpoint.value)" -ForegroundColor Gray
Write-Host "  Direct RDS Endpoint: $($newEnvVars["DB_HOST_DIRECT"])" -ForegroundColor Gray
Write-Host "  CLI Database Access: Direct RDS (publicly accessible)" -ForegroundColor Green
Write-Host "  AWS Region: $($terraformOutput.environment_variables_summary.value.aws_region)" -ForegroundColor Gray
Write-Host "  SQS Load Season Stats URL: $($terraformOutput.environment_variables_summary.value.sqs_load_season_stats_url)" -ForegroundColor Gray
Write-Host "  SQS Automatic Drafts URL: $($terraformOutput.environment_variables_summary.value.sqs_automatic_drafts_url)" -ForegroundColor Gray
Write-Host "  Google Client ID: $($terraformOutput.environment_variables_summary.value.google_oauth_client_id)" -ForegroundColor Gray
Write-Host "  Secrets configured: JWT, Google OAuth, Cookie" -ForegroundColor Gray
Write-Host ""
Write-Host "Database Credential Resolution:" -ForegroundColor Cyan
Write-Host "  Production apps will automatically fetch DB credentials from AWS Secrets Manager" -ForegroundColor Green
Write-Host "  DATABASE_URL set in .env for tools that require it (drizzle, etc.)" -ForegroundColor Green
Write-Host "  Use 'pnpm run db:test:production' to validate database connectivity" -ForegroundColor Green
Write-Host "  Use 'pnpm run db:credentials:production' to view resolved credentials" -ForegroundColor Green
Write-Host ""
Write-Host "Migration Notes:" -ForegroundColor Yellow
Write-Host "  Set -DatabaseEndpoint direct for database migrations and admin tasks"
Write-Host "  Set -DatabaseEndpoint proxy (default) for production applications"  
Write-Host "  Local development settings preserved (update .env.local separately)"
