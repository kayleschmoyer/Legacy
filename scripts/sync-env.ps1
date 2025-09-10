# Legacy Sports Environment Variables Sync Script
# This script pulls environment variables from AWS and updates the .env file
#
# Database Connection Strategy:
# - DB_HOST: RDS Proxy endpoint (use for runtime/production)
# - DB_HOST_DIRECT: Direct RDS endpoint (use for migrations and admin tasks)
# - The script updates both values for flexibility
#
# Special Character Handling:
# - Automatically escapes dollar signs ($) in DB_PASSWORD for proper dotenv parsing
# - Adds SSL configuration for secure database connections

param(
    [string]$Environment = "dev",
    [string]$TerraformDir = "terraform",
    [string]$EnvFile = ".env",
    [switch]$DryRun,
    [switch]$Backup,
    [ValidateSet("proxy", "direct")]
    [string]$DatabaseEndpoint = "direct"  # Use direct endpoint by default for migrations
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

# Get database credentials
$dbCredsSecretName = $terraformOutput.environment_variables_summary.value.db_creds_secret_name
Write-Host "  Database credentials from: $dbCredsSecretName" -ForegroundColor Gray
$dbCredsJson = aws secretsmanager get-secret-value --secret-id $dbCredsSecretName --query "SecretString" --output text
$dbCreds = $dbCredsJson | ConvertFrom-Json

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

# Build the new environment variables
$newEnvVars = @{}
$newEnvVars["EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID"] = $terraformOutput.environment_variables_summary.value.google_oauth_client_id
$newEnvVars["CLIENT_ID"] = $terraformOutput.environment_variables_summary.value.google_oauth_client_id
$newEnvVars["GOOGLE_OAUTH_CLIENT_SECRET"] = $googleSecret
$newEnvVars["DB_USER"] = $dbCreds.username
$newEnvVars["DB_PASSWORD"] = $dbCreds.password
$newEnvVars["DB_PORT"] = "5432"
$newEnvVars["DB_SSL_MODE"] = "require"
$newEnvVars["DB_CERT_PATH"] = "C:/code/legacy-sports/certs/us-east-1-bundle.pem"
$newEnvVars["JWT_SECRET"] = $jwtSecret
$newEnvVars["COOKIE_SECRET"] = $cookieSecret

# Add new AWS-specific environment variables
$newEnvVars["AWS_REGION"] = $terraformOutput.environment_variables_summary.value.aws_region
$newEnvVars["DB_CREDENTIALS_SECRET_NAME"] = $terraformOutput.environment_variables_summary.value.db_creds_secret_name
$newEnvVars["RDS_PROXY_ENDPOINT"] = $terraformOutput.rds_proxy_endpoint.value
$newEnvVars["USE_LOCAL_CREDS"] = "true"

# Get direct database endpoint for migrations (if available)
try {
    Push-Location $TerraformDir
    $directDbEndpoint = terraform output -raw rds_instance_endpoint
    Pop-Location
    
    # Strip port if present (format: host:port)
    $directDbHost = $directDbEndpoint -replace ':.*$', ''
    $newEnvVars["DB_HOST_DIRECT"] = $directDbHost
    
    # Set main DB_HOST based on user preference
    if ($DatabaseEndpoint -eq "direct") {
        $newEnvVars["DB_HOST"] = $directDbHost
        Write-Host "Using direct database endpoint for DB_HOST" -ForegroundColor Yellow
    } else {
        $proxyEndpoint = $terraformOutput.environment_variables_summary.value.db_host
        $proxyHost = $proxyEndpoint -replace ':.*$', ''
        $newEnvVars["DB_HOST"] = $proxyHost
        Write-Host "Using RDS proxy endpoint for DB_HOST" -ForegroundColor Yellow
    }
} catch {
    Write-Warning "Could not retrieve direct database endpoint. Using proxy endpoint."
    $proxyEndpoint = $terraformOutput.environment_variables_summary.value.db_host
    $proxyHost = $proxyEndpoint -replace ':.*$', ''
    $newEnvVars["DB_HOST"] = $proxyHost
    Pop-Location
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
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Database Type: PG_REMOTE" -ForegroundColor Gray
Write-Host "  Database Host (Active): $($newEnvVars["DB_HOST"])" -ForegroundColor Gray
Write-Host "  Database Host (Proxy): $($terraformOutput.rds_proxy_endpoint.value)" -ForegroundColor Gray
Write-Host "  Database Host (Direct): $($newEnvVars["DB_HOST_DIRECT"])" -ForegroundColor Gray
Write-Host "  Database User: $($dbCreds.username)" -ForegroundColor Gray
Write-Host "  AWS Region: $($terraformOutput.environment_variables_summary.value.aws_region)" -ForegroundColor Gray
Write-Host "  Google Client ID: $($terraformOutput.environment_variables_summary.value.google_oauth_client_id)" -ForegroundColor Gray
Write-Host "  Secrets updated: JWT, Google OAuth, Cookie, Database Password" -ForegroundColor Gray
Write-Host ""
Write-Host "Note: Use -DatabaseEndpoint proxy for runtime, -DatabaseEndpoint direct for migrations." -ForegroundColor Cyan
Write-Host "Note: Local development URLs are preserved. Update manually if needed." -ForegroundColor Cyan
