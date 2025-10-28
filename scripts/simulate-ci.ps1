# Local CI Simulation Script (PowerShell)
# Simulates the improved CI pipeline locally for debugging and testing
# Usage: .\simulate-ci.ps1 [-Verbose] [-Stage <stage>]

param(
    [switch]$Verbose,
    [ValidateSet("setup", "quality", "test", "build", "deploy", "")]
    [string]$Stage = ""
)

# Setup CI-like environment
$env:NX_DAEMON = "false"
$env:NX_PARALLEL = "4"
$env:NX_CACHE_DIRECTORY = ".nx-cache"
$env:NX_SKIP_NX_CACHE = "false"
$env:NODE_OPTIONS = "--max_old_space_size=4096"

if ($Verbose) {
    $env:NX_VERBOSE_LOGGING = "true"
    $env:DEBUG = "nx:*"
}

Write-Host "🚀 Legacy Sports CI Pipeline Simulation" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script simulates the improved CI pipeline locally."
Write-Host "Environment configured to match GitHub Actions runners."
Write-Host ""

# Function to run a stage
function Invoke-Stage {
    param(
        [string]$StageName,
        [string]$StageId,
        [scriptblock]$ScriptBlock
    )
    
    if ($Stage -ne "" -and $Stage -ne $StageId) {
        return $true
    }
    
    Write-Host "🔄 Stage: $StageName" -ForegroundColor Cyan
    Write-Host "----------------------------------------"
    
    $startTime = Get-Date
    
    try {
        & $ScriptBlock
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalSeconds
        Write-Host "✅ $StageName completed successfully (${duration}s)" -ForegroundColor Green
        return $true
    }
    catch {
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalSeconds
        Write-Host "❌ $StageName failed after ${duration}s" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Debugging Tips:" -ForegroundColor Yellow
        Write-Host "• Check the error output above"
        Write-Host "• Run individual commands to isolate the issue"
        Write-Host "• Ensure all dependencies are installed"
        Write-Host "• Check for environment-specific issues"
        Write-Error "Stage failed: $StageName"
        return $false
    }
    finally {
        Write-Host ""
    }
}

# Function for environment setup
function Initialize-Environment {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    
    # Check Node.js version
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion"
    
    pnpm fetch --prefer-offline | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  pnpm fetch encountered issues; continuing with install" -ForegroundColor Yellow
    }

    pnpm install --frozen-lockfile --offline | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed successfully from local store" -ForegroundColor Green
        return
    }

    Write-Host "ℹ️  Offline install failed; retrying with network access..." -ForegroundColor Yellow
    pnpm install --frozen-lockfile | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency installation failed"
    }

    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
}

# Function for detecting changes
function Get-ChangedFiles {
    Write-Host "🔍 Detecting changed files..." -ForegroundColor Cyan
    
    # Check if we're on a feature branch
    $currentBranch = git branch --show-current
    if ($currentBranch -eq "main") {
        Write-Host "⚠️  Running on main branch - will check all projects" -ForegroundColor Yellow
        @{
            web = $true
            mobile = $true
            lambdas = $true
            terraform = $true
        }
    } else {
        # Check for changes against main
        Write-Host "Comparing $currentBranch against origin/main"
        
        # Ensure main is up to date
        try { git fetch origin main --quiet } catch { Write-Host "Could not fetch origin/main" }
        
        # Detect changed files
        $changedFiles = git diff --name-only origin/main...HEAD
        
        $changes = @{
            web = ($changedFiles | Where-Object { $_ -match '^apps/web/|^lib/(shared-components|tamagui-config)/' }).Count -gt 0
            mobile = ($changedFiles | Where-Object { $_ -match '^apps/app/|^lib/(shared-components|tamagui-config)/' }).Count -gt 0
            lambdas = ($changedFiles | Where-Object { $_ -match '^lambdas/|^lib/(api|db-client)/' }).Count -gt 0
            terraform = ($changedFiles | Where-Object { $_ -match '^terraform/' }).Count -gt 0
        }
        
        Write-Host "Change detection results:"
        $changes.GetEnumerator() | ForEach-Object {
            Write-Host "  $($_.Key)=$($_.Value)"
        }
        
        return $changes
    }
}

# Function for code quality checks
function Test-CodeQuality {
    Write-Host "🎨 Checking code formatting..." -ForegroundColor Cyan
    if ($Verbose) {
        Write-Host "Command: pnpm exec nx format:check --base=origin/main --head=HEAD"
    }
    
    $result = pnpm exec nx format:check --base=origin/main --head=HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Code formatting issues detected" -ForegroundColor Red
        Write-Host "💡 Fix with: pnpm exec nx format:write" -ForegroundColor Yellow
        throw "Format check failed"
    }
    
    Write-Host "🔧 Running ESLint validation..." -ForegroundColor Cyan
    if ($Verbose) {
        Write-Host "Command: pnpm exec nx affected -t lint --base=origin/main --head=HEAD --parallel=4"
    }
    
    $result = pnpm exec nx affected -t lint --base=origin/main --head=HEAD --parallel=4
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ESLint validation failed" -ForegroundColor Red
        Write-Host "💡 Try auto-fix: pnpm exec nx affected -t lint --fix" -ForegroundColor Yellow
        throw "ESLint failed"
    }
    
    Write-Host "📝 Running TypeScript type check..." -ForegroundColor Cyan
    if ($Verbose) {
        Write-Host "Command: pnpm exec nx affected -t typecheck --base=origin/main --head=HEAD --parallel=2"
    }
    
    $result = pnpm exec nx affected -t typecheck --base=origin/main --head=HEAD --parallel=2
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ TypeScript validation failed" -ForegroundColor Red
        Write-Host "💡 Check types: pnpm exec nx affected -t typecheck" -ForegroundColor Yellow
        throw "TypeScript check failed"
    }
}

# Function for running tests
function Invoke-Tests {
    Write-Host "🧪 Running unit tests..." -ForegroundColor Cyan
    if ($Verbose) {
        Write-Host "Command: pnpm exec nx affected -t test --base=origin/main --head=HEAD --parallel=4 --coverage=false"
    }
    
    $result = pnpm exec nx affected -t test --base=origin/main --head=HEAD --parallel=4 --coverage=false
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Unit tests failed" -ForegroundColor Red
        Write-Host "💡 Debug specific test: pnpm exec nx test <project-name>" -ForegroundColor Yellow
        throw "Unit tests failed"
    }
    
    # Check if integration tests exist
    if ((Test-Path "jest.integration.config.js") -or (pnpm run test:integration --dry-run 2>$null)) {
        Write-Host "🔄 Running integration tests..." -ForegroundColor Cyan
        $result = pnpm run test:integration
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Integration tests failed" -ForegroundColor Red
            throw "Integration tests failed"
        }
    } else {
        Write-Host "ℹ️  No integration tests configured, skipping" -ForegroundColor Yellow
    }
}

# Function for build validation
function Test-Builds {
    param([hashtable]$Changes)
    
    if ($Changes.web) {
        Write-Host "📦 Building web application..." -ForegroundColor Cyan
        if ($Verbose) {
            Write-Host "Command: pnpm exec nx build web --verbose"
        }
        
        $buildArgs = @("nx", "build", "web")
        if ($Verbose) { $buildArgs += "--verbose" }
        
        $result = & pnpm exec $buildArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Web application build failed" -ForegroundColor Red
            throw "Web build failed"
        }
        
        # Check build artifacts
        if (Test-Path "dist/apps/web") {
            $buildSize = (Get-ChildItem -Path "dist/apps/web" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
            Write-Host "✅ Web build completed successfully (size: $([math]::Round($buildSize, 2)) MB)" -ForegroundColor Green
        }
    }
    
    if ($Changes.lambdas) {
        Write-Host "⚡ Building lambda functions..." -ForegroundColor Cyan
        if ($Verbose) {
            Write-Host "Command: pnpm exec nx affected -t build --base=origin/main --head=HEAD --projects='lambdas-*'"
        }
        
        $result = pnpm exec nx affected -t build --base=origin/main --head=HEAD --projects="lambdas-*"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Lambda functions build failed" -ForegroundColor Red
            throw "Lambda build failed"
        }
        
        # Try to package lambdas
        Write-Host "📦 Packaging lambda functions..." -ForegroundColor Cyan
        $result = pnpm exec nx affected -t package --base=origin/main --head=HEAD --projects="lambdas-*" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Lambda functions packaged successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Lambda packaging failed (may be expected if no package target)" -ForegroundColor Yellow
        }
    }
    
    if ($Changes.mobile) {
        Write-Host "📱 Validating mobile build configuration..." -ForegroundColor Cyan
        if ($Verbose) {
            Write-Host "Command: pnpm exec nx build app --dry-run"
        }
        
        $result = pnpm exec nx build app --dry-run
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Mobile build configuration is invalid" -ForegroundColor Red
            throw "Mobile build validation failed"
        }
        
        Write-Host "✅ Mobile build configuration is valid" -ForegroundColor Green
        Write-Host "ℹ️  Note: Full mobile builds require platform-specific environments" -ForegroundColor Cyan
    }
}

# Function for deployment validation
function Test-Deployment {
    param([hashtable]$Changes)
    
    if ($Changes.terraform) {
        Write-Host "🔐 Validating Terraform configuration..." -ForegroundColor Cyan
        
        Push-Location terraform
        
        try {
            if ($Verbose) {
                Write-Host "Command: terraform init -backend=false"
            }
            
            $result = terraform init -backend=false
            if ($LASTEXITCODE -ne 0) {
                throw "Terraform initialization failed"
            }
            
            if ($Verbose) {
                Write-Host "Command: terraform validate"
            }
            
            $result = terraform validate
            if ($LASTEXITCODE -ne 0) {
                throw "Terraform validation failed"
            }
            
            Write-Host "✅ Terraform configuration is valid" -ForegroundColor Green
        }
        finally {
            Pop-Location
        }
    }
}

# Main execution
try {
    Write-Host "Starting CI simulation..."
    Write-Host "Base branch: origin/main"
    Write-Host "Current branch: $(git branch --show-current)"
    Write-Host ""

    # Initialize changes variable
    $changes = $null

    # Run stages
    $success = $true
    
    $success = $success -and (Invoke-Stage "Environment Setup" "setup" {
        Initialize-Environment
    })
    
    $success = $success -and (Invoke-Stage "Change Detection" "detect" {
        $script:changes = Get-ChangedFiles
    })
    
    $success = $success -and (Invoke-Stage "Code Quality Checks" "quality" {
        Test-CodeQuality
    })
    
    $success = $success -and (Invoke-Stage "Test Execution" "test" {
        Invoke-Tests
    })
    
    $success = $success -and (Invoke-Stage "Build Validation" "build" {
        Test-Builds -Changes $changes
    })
    
    $success = $success -and (Invoke-Stage "Deployment Validation" "deploy" {
        Test-Deployment -Changes $changes
    })

    if ($success) {
        # Final summary
        Write-Host "🎉 CI Pipeline Simulation Completed Successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Summary:" -ForegroundColor Cyan
        Write-Host "• All code quality checks passed"
        Write-Host "• All tests executed successfully"
        Write-Host "• All builds completed without errors"
        Write-Host "• Deployment validation passed"
        Write-Host ""
        Write-Host "💡 Next Steps:" -ForegroundColor Blue
        Write-Host "• Your changes are ready for CI"
        Write-Host "• Push your branch and create a PR"
        Write-Host "• The actual CI should behave similarly to this simulation"
        Write-Host ""
        Write-Host "✅ Local CI simulation complete!" -ForegroundColor Green
    }
}
catch {
    Write-Host "CI simulation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
