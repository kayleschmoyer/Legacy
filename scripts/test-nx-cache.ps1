#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test Nx Remote Caching implementation locally

.DESCRIPTION
    Simulates the GitHub Actions cache workflow locally to validate:
    - Cache key generation
    - Nx cache detection
    - Build performance with/without cache

.PARAMETER Scenario
    Test scenario: 'cache-hit', 'cache-miss', or 'benchmark'

.PARAMETER CleanCache
    Clear Nx cache before testing

.EXAMPLE
    .\test-nx-cache.ps1 -Scenario cache-hit
    
.EXAMPLE
    .\test-nx-cache.ps1 -Scenario benchmark -CleanCache
#>

param(
    [Parameter()]
    [ValidateSet('cache-hit', 'cache-miss', 'benchmark')]
    [string]$Scenario = 'cache-hit',
    
    [Parameter()]
    [switch]$CleanCache
)

$ErrorActionPreference = 'Stop'

Write-Host "🧪 Testing Nx Remote Caching Implementation" -ForegroundColor Cyan
Write-Host "Scenario: $Scenario" -ForegroundColor Yellow
Write-Host ""

# Configuration
$NX_CACHE_DIR = ".nx-cache"
$NX_INTERNAL_CACHE = "node_modules/.cache/nx"

function Get-CacheStats {
    Write-Host "📊 Cache Statistics:" -ForegroundColor Cyan
    
    if (Test-Path $NX_CACHE_DIR) {
        $files = (Get-ChildItem -Path $NX_CACHE_DIR -Recurse -File).Count
        $size = (Get-ChildItem -Path $NX_CACHE_DIR -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "  .nx-cache: $files files, $([math]::Round($size, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "  .nx-cache: Not found" -ForegroundColor Yellow
    }
    
    if (Test-Path $NX_INTERNAL_CACHE) {
        $size = (Get-ChildItem -Path $NX_INTERNAL_CACHE -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "  node_modules/.cache/nx: $([math]::Round($size, 2)) MB" -ForegroundColor Green
    } else {
        Write-Host "  node_modules/.cache/nx: Not found" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

function Test-CacheKey {
    Write-Host "🔑 Generating Cache Keys (GitHub Actions Simulation):" -ForegroundColor Cyan
    
    # Get current branch
    $branch = git branch --show-current
    
    # Simulate dependency hash
    if (Test-Path "pnpm-lock.yaml") {
        $depsHash = (Get-FileHash -Path "pnpm-lock.yaml" -Algorithm SHA256).Hash.Substring(0, 12)
    } elseif (Test-Path "package-lock.json") {
        $depsHash = (Get-FileHash -Path "package-lock.json" -Algorithm SHA256).Hash.Substring(0, 12)
    } else {
        $depsHash = "no-lockfile"
    }
    
    # Simulate config hash
    $configFiles = @("nx.json", "tsconfig.base.json") | Where-Object { Test-Path $_ }
    if ($configFiles.Count -gt 0) {
        $configHash = ($configFiles | ForEach-Object { 
            (Get-FileHash -Path $_ -Algorithm SHA256).Hash 
        } | Out-String | Get-FileHash -Algorithm SHA256 -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($_)))).Hash.Substring(0, 12)
    } else {
        $configHash = "no-config"
    }
    
    $cacheKey = "nx-cache-$branch-$depsHash-$configHash"
    
    Write-Host "  Branch: $branch" -ForegroundColor White
    Write-Host "  Dependencies Hash: $depsHash" -ForegroundColor White
    Write-Host "  Config Hash: $configHash" -ForegroundColor White
    Write-Host "  Cache Key: $cacheKey" -ForegroundColor Green
    Write-Host ""
    
    return $cacheKey
}

function Clear-NxCache {
    Write-Host "🗑️  Clearing Nx cache..." -ForegroundColor Yellow
    
    if (Test-Path $NX_CACHE_DIR) {
        Remove-Item -Path $NX_CACHE_DIR -Recurse -Force
        Write-Host "  Removed $NX_CACHE_DIR" -ForegroundColor Gray
    }
    
    if (Test-Path $NX_INTERNAL_CACHE) {
        Remove-Item -Path $NX_INTERNAL_CACHE -Recurse -Force
        Write-Host "  Removed $NX_INTERNAL_CACHE" -ForegroundColor Gray
    }
    
    Write-Host "✅ Cache cleared" -ForegroundColor Green
    Write-Host ""
}

function Test-NxBuild {
    param(
        [string]$Label,
        [switch]$SkipCache
    )
    
    Write-Host "🏃 Running: $Label" -ForegroundColor Cyan
    
    $cmd = "pnpm exec nx run-many -t build --projects=utils,db-client,api"
    if ($SkipCache) {
        $cmd += " --skip-nx-cache"
    }
    
    $startTime = Get-Date
    
    Write-Host "  Command: $cmd" -ForegroundColor Gray
    Invoke-Expression $cmd | Out-Host
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host "  Duration: $([math]::Round($duration, 2))s" -ForegroundColor Green
    Write-Host ""
    
    return $duration
}

# Main execution
Write-Host "📋 Initial State:" -ForegroundColor Cyan
Get-CacheStats

if ($CleanCache) {
    Clear-NxCache
}

switch ($Scenario) {
    'cache-hit' {
        Write-Host "=== Testing Cache Hit Scenario ===" -ForegroundColor Magenta
        Write-Host ""
        
        Test-CacheKey | Out-Null
        
        Write-Host "Step 1: Initial build (no cache)" -ForegroundColor Yellow
        Test-NxBuild -Label "Initial Build" -SkipCache | Out-Null
        
        Write-Host "📦 Cache should now be populated:" -ForegroundColor Cyan
        Get-CacheStats
        
        Write-Host "Step 2: Second build (should use cache)" -ForegroundColor Yellow
        Test-NxBuild -Label "Cached Build" | Out-Null
        
        Write-Host "✅ Cache hit test complete!" -ForegroundColor Green
        Write-Host "Check build output for '[cached]' messages" -ForegroundColor Gray
    }
    
    'cache-miss' {
        Write-Host "=== Testing Cache Miss Scenario ===" -ForegroundColor Magenta
        Write-Host ""
        
        Test-CacheKey | Out-Null
        Clear-NxCache
        
        Write-Host "Step 1: Build with no cache available" -ForegroundColor Yellow
        Test-NxBuild -Label "Cache Miss Build" | Out-Null
        
        Write-Host "✅ Cache miss test complete!" -ForegroundColor Green
        Write-Host "Cache should now be populated for next run" -ForegroundColor Gray
        Get-CacheStats
    }
    
    'benchmark' {
        Write-Host "=== Benchmarking Cache Performance ===" -ForegroundColor Magenta
        Write-Host ""
        
        Test-CacheKey | Out-Null
        
        Write-Host "Benchmark 1: Without cache" -ForegroundColor Yellow
        Clear-NxCache
        $noCacheTime = Test-NxBuild -Label "Without Cache" -SkipCache
        
        Write-Host "Benchmark 2: With cache (second run)" -ForegroundColor Yellow
        $withCacheTime = Test-NxBuild -Label "With Cache"
        
        Write-Host "📊 Performance Comparison:" -ForegroundColor Cyan
        Write-Host "  Without Cache: $([math]::Round($noCacheTime, 2))s" -ForegroundColor White
        Write-Host "  With Cache: $([math]::Round($withCacheTime, 2))s" -ForegroundColor White
        
        if ($noCacheTime -gt 0) {
            $savings = [math]::Round((1 - ($withCacheTime / $noCacheTime)) * 100, 2)
            $timeSaved = [math]::Round($noCacheTime - $withCacheTime, 2)
            Write-Host "  ⚡ Speed Improvement: $savings%" -ForegroundColor Green
            Write-Host "  ⏰ Time Saved: ${timeSaved}s" -ForegroundColor Green
        }
        
        Write-Host ""
        Get-CacheStats
    }
}

Write-Host ""
Write-Host "📝 Notes:" -ForegroundColor Cyan
Write-Host "  - This simulates the GitHub Actions cache workflow" -ForegroundColor Gray
Write-Host "  - In CI, cache is restored from base branch (main) on PRs" -ForegroundColor Gray
Write-Host "  - Nx automatically uses cache when task inputs haven't changed" -ForegroundColor Gray
Write-Host ""
Write-Host "🔍 To verify cache is working:" -ForegroundColor Cyan
Write-Host "  - Look for '[cached]' in Nx output" -ForegroundColor Gray
Write-Host "  - Check .nx-cache directory for cached outputs" -ForegroundColor Gray
Write-Host "  - Run: pnpm exec nx reset  (to clear cache)" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Test complete!" -ForegroundColor Green
