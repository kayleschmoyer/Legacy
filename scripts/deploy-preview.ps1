<#
.SYNOPSIS
  Deploy a local web build to the PR preview site on GitHub Pages.

.DESCRIPTION
  Builds the web app with the correct base path and pushes it to the
  legacy-sports-deploys repo under a named subdirectory.

.PARAMETER Name
  Subdirectory name for the deploy (e.g. "my-feature", "test-fix").
  The preview will be available at:
    https://bkrupa.github.io/legacy-sports-deploys/<Name>/

.PARAMETER Clean
  Remove the named preview instead of deploying.

.EXAMPLE
  .\scripts\deploy-preview.ps1 -Name my-feature
  .\scripts\deploy-preview.ps1 -Name my-feature -Clean
#>
param(
  [Parameter(Mandatory)]
  [ValidatePattern('^[a-zA-Z0-9_-]+$')]
  [string]$Name,

  [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$DeployRepo = 'bkrupa/legacy-sports-deploys'
$BaseUrl    = 'https://bkrupa.github.io/legacy-sports-deploys'
$RepoRoot   = (git rev-parse --show-toplevel 2>$null) -replace '/', '\'

if (-not $RepoRoot) {
  Write-Error "Not inside a git repository"
  return
}

# ── Clean mode ────────────────────────────────────────────────────────
if ($Clean) {
  Write-Host "`n🧹 Removing preview '$Name'..." -ForegroundColor Yellow

  $tmp = Join-Path $env:TEMP "ls-preview-clean-$(Get-Random)"
  git clone --depth 1 --branch gh-pages "https://github.com/$DeployRepo.git" $tmp 2>&1 | Out-Null

  if (-not (Test-Path "$tmp\$Name")) {
    Write-Host "  No preview found for '$Name', nothing to remove" -ForegroundColor Gray
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    return
  }

  Push-Location $tmp
  Remove-Item $Name -Recurse -Force
  git add -A
  git commit -m "cleanup: remove $Name preview" 2>&1 | Out-Null
  git push origin gh-pages
  Pop-Location

  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "✅ Removed preview: $BaseUrl/$Name/" -ForegroundColor Green
  return
}

# ── Build ─────────────────────────────────────────────────────────────
Write-Host "`n🔨 Building web app for preview '$Name'..." -ForegroundColor Cyan

$env:VITE_BASE_PATH = "/legacy-sports-deploys/$Name/"
$env:NODE_ENV = 'production'

Push-Location $RepoRoot
try {
  pnpm exec nx build web --configuration=production
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }
} finally {
  Pop-Location
}

$distDir = Join-Path $RepoRoot 'dist\apps\web'

# SPA fallback
Copy-Item "$distDir\index.html" "$distDir\404.html"

# ── Deploy ────────────────────────────────────────────────────────────
Write-Host "`n🚀 Deploying to $BaseUrl/$Name/ ..." -ForegroundColor Cyan

$tmp = Join-Path $env:TEMP "ls-preview-deploy-$(Get-Random)"
git clone --depth 1 --branch gh-pages "https://github.com/$DeployRepo.git" $tmp 2>&1 | Out-Null

# Replace the target directory
if (Test-Path "$tmp\$Name") {
  Remove-Item "$tmp\$Name" -Recurse -Force
}
Copy-Item $distDir "$tmp\$Name" -Recurse

Push-Location $tmp
git add -A
git commit -m "deploy: $Name preview" 2>&1 | Out-Null
git push origin gh-pages
Pop-Location

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# Clean up env
Remove-Item Env:\VITE_BASE_PATH -ErrorAction SilentlyContinue

Write-Host "`n✅ Preview deployed!" -ForegroundColor Green
Write-Host "   $BaseUrl/$Name/" -ForegroundColor White
