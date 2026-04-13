#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automatically resolves conflicts in generated files during rebase
.DESCRIPTION
    This script resolves common conflicts in generated files by regenerating them
    from their source, which is the correct approach for codegen'd files.
.EXAMPLE
    .\scripts\resolve-generated-conflicts.ps1
#>

$graphqlGeneratedFiles = @(
    "apps/app/src/api/db/graphql.generated.ts",
    "apps/web/src/api/db/graphql.generated.ts",
    "apps/cli/src/api/db/graphql.generated.ts"
)

$schemaFiles = @(
    "lambdas/db/src/schema/index.ts",
    "lib/db-client/src/drizzle/public/schema.ts",
    "lib/db-client/src/index.ts"
)

$docFiles = @(
    "docs/api/graphql-schema.md"
)

$lockFiles = @(
    "pnpm-lock.yaml"
)

$migrationPattern = "^lib/db-client/src/drizzle/migrations/"

$conflictedFiles = git diff --name-only --diff-filter=U

if (-not $conflictedFiles) {
    Write-Host "[OK] No conflicts detected" -ForegroundColor Green
    exit 0
}

$hasGraphQLConflicts = $false
$hasSchemaConflicts = $false
$hasDocConflicts = $false
$hasLockfileConflicts = $false
$hasMigrationConflicts = $false

# Check which types of conflicts we have
foreach ($file in $conflictedFiles) {
    if ($graphqlGeneratedFiles -contains $file) {
        $hasGraphQLConflicts = $true
        Write-Host "[->] GraphQL conflict detected: $file" -ForegroundColor Cyan
    }
    elseif ($schemaFiles -contains $file) {
        $hasSchemaConflicts = $true
        Write-Host "[->] Schema conflict detected: $file" -ForegroundColor Cyan
    }
    elseif ($docFiles -contains $file) {
        $hasDocConflicts = $true
        Write-Host "[->] Doc conflict detected: $file" -ForegroundColor Cyan
    }
    elseif ($lockFiles -contains $file) {
        $hasLockfileConflicts = $true
        Write-Host "[->] Lockfile conflict detected: $file" -ForegroundColor Cyan
    }
    elseif ($file -match $migrationPattern) {
        $hasMigrationConflicts = $true
        Write-Host "[->] Migration conflict detected: $file" -ForegroundColor Cyan
    }
}

# For schema files, accept theirs (manual source files)
if ($hasSchemaConflicts) {
    Write-Host "`n[->] Resolving schema conflicts by accepting incoming changes..." -ForegroundColor Yellow
    foreach ($file in $schemaFiles) {
        if ($conflictedFiles -contains $file) {
            git checkout --theirs $file
            git add $file
            Write-Host "  [OK] $file" -ForegroundColor Green
        }
    }
}

# For doc files, accept theirs
if ($hasDocConflicts) {
    Write-Host "`n[->] Resolving documentation conflicts by accepting incoming changes..." -ForegroundColor Yellow
    foreach ($file in $docFiles) {
        if ($conflictedFiles -contains $file) {
            git checkout --theirs $file
            git add $file
            Write-Host "  [OK] $file" -ForegroundColor Green
        }
    }
}

# For GraphQL generated files, regenerate them
if ($hasGraphQLConflicts) {
    Write-Host "`n[->] Regenerating GraphQL types to resolve conflicts..." -ForegroundColor Yellow
    
    # Accept theirs first to clear conflicts
    foreach ($file in $graphqlGeneratedFiles) {
        if ($conflictedFiles -contains $file) {
            git checkout --theirs $file | Out-Null
        }
    }
    
    # Regenerate
    Write-Host "  [->] Running codegen..." -ForegroundColor Cyan
    $codegenResult = & make codegen 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Codegen completed successfully" -ForegroundColor Green
        
        # Add the regenerated files
        foreach ($file in $graphqlGeneratedFiles) {
            if (Test-Path $file) {
                git add $file
            }
        }
    } else {
        Write-Host "  [ERROR] Codegen failed. You may need to run it manually after completing the rebase." -ForegroundColor Red
        Write-Host "  Error: $codegenResult" -ForegroundColor Red
        
        # Fall back to accepting theirs
        foreach ($file in $graphqlGeneratedFiles) {
            if ($conflictedFiles -contains $file) {
                git add $file
            }
        }
    }
}

# For lockfile conflicts, accept theirs and regenerate
if ($hasLockfileConflicts) {
    Write-Host "`n[->] Resolving lockfile conflicts..." -ForegroundColor Yellow
    git checkout --theirs pnpm-lock.yaml
    git add pnpm-lock.yaml
    Write-Host "  [->] Regenerating lockfile with make install..." -ForegroundColor Cyan
    $installResult = & make install 2>&1
    if ($LASTEXITCODE -eq 0) {
        git add pnpm-lock.yaml
        Write-Host "  [OK] pnpm-lock.yaml regenerated" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] pnpm install failed. Resolve manually after rebase." -ForegroundColor Red
        Write-Host "  Error: $installResult" -ForegroundColor Red
    }
}

# For migration conflicts, accept theirs (duplicates should be skipped via git rebase --skip)
if ($hasMigrationConflicts) {
    Write-Host "`n[->] Resolving migration conflicts by accepting incoming changes..." -ForegroundColor Yellow
    foreach ($file in $conflictedFiles) {
        if ($file -match $migrationPattern) {
            git checkout --theirs $file
            git add $file
            Write-Host "  [OK] $file" -ForegroundColor Green
        }
    }
    Write-Host "  [NOTE] If migration files are duplicated, consider: git rebase --skip" -ForegroundColor Yellow
}

# Check if there are remaining conflicts
$remainingConflicts = git diff --name-only --diff-filter=U
if ($remainingConflicts) {
    Write-Host "" 
    Write-Host "[WARNING] Remaining conflicts require manual resolution:" -ForegroundColor Yellow
    $remainingConflicts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 1
} else {
    Write-Host "`n[OK] All conflicts resolved!" -ForegroundColor Green
    exit 0
}
