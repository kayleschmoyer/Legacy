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
    "apps/cli/src/api/db/graphql.generated.ts",
    "apps/app/src/api/db/graphql.schema.json",
    "apps/web/src/api/db/graphql.schema.json"
)

$schemaFiles = @(
    "lambdas/db/src/schema/index.ts",
    "lib/db-client/src/drizzle/public/schema.ts",
    "lib/db-client/src/index.ts"
)

$docFiles = @(
    "docs/api/graphql-schema.md"
)

$conflictedFiles = git diff --name-only --diff-filter=U

if (-not $conflictedFiles) {
    Write-Host "✓ No conflicts detected" -ForegroundColor Green
    exit 0
}

$hasGraphQLConflicts = $false
$hasSchemaConflicts = $false
$hasDocConflicts = $false

# Check which types of conflicts we have
foreach ($file in $conflictedFiles) {
    if ($graphqlGeneratedFiles -contains $file) {
        $hasGraphQLConflicts = $true
        Write-Host "→ GraphQL conflict detected: $file" -ForegroundColor Cyan
    }
    elseif ($schemaFiles -contains $file) {
        $hasSchemaConflicts = $true
        Write-Host "→ Schema conflict detected: $file" -ForegroundColor Cyan
    }
    elseif ($docFiles -contains $file) {
        $hasDocConflicts = $true
        Write-Host "→ Doc conflict detected: $file" -ForegroundColor Cyan
    }
}

# For schema files, accept theirs (manual source files)
if ($hasSchemaConflicts) {
    Write-Host "`n→ Resolving schema conflicts by accepting incoming changes..." -ForegroundColor Yellow
    foreach ($file in $schemaFiles) {
        if ($conflictedFiles -contains $file) {
            git checkout --theirs $file
            git add $file
            Write-Host "  ✓ $file" -ForegroundColor Green
        }
    }
}

# For doc files, accept theirs
if ($hasDocConflicts) {
    Write-Host "`n→ Resolving documentation conflicts by accepting incoming changes..." -ForegroundColor Yellow
    foreach ($file in $docFiles) {
        if ($conflictedFiles -contains $file) {
            git checkout --theirs $file
            git add $file
            Write-Host "  ✓ $file" -ForegroundColor Green
        }
    }
}

# For GraphQL generated files, regenerate them
if ($hasGraphQLConflicts) {
    Write-Host "`n→ Regenerating GraphQL types to resolve conflicts..." -ForegroundColor Yellow
    
    # Accept theirs first to clear conflicts
    foreach ($file in $graphqlGeneratedFiles) {
        if ($conflictedFiles -contains $file) {
            git checkout --theirs $file | Out-Null
        }
    }
    
    # Regenerate
    Write-Host "  → Running codegen..." -ForegroundColor Cyan
    $codegenResult = & make codegen 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Codegen completed successfully" -ForegroundColor Green
        
        # Add the regenerated files
        foreach ($file in $graphqlGeneratedFiles) {
            if (Test-Path $file) {
                git add $file
            }
        }
    } else {
        Write-Host "  ✗ Codegen failed. You may need to run it manually after completing the rebase." -ForegroundColor Red
        Write-Host "  Error: $codegenResult" -ForegroundColor Red
        
        # Fall back to accepting theirs
        foreach ($file in $graphqlGeneratedFiles) {
            if ($conflictedFiles -contains $file) {
                git add $file
            }
        }
    }
}

# Check if there are remaining conflicts
$remainingConflicts = git diff --name-only --diff-filter=U
if ($remainingConflicts) {
    Write-Host "" 
    Write-Host "⚠ Remaining conflicts require manual resolution:" -ForegroundColor Yellow
    $remainingConflicts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 1
} else {
    Write-Host "`n✓ All conflicts resolved!" -ForegroundColor Green
    exit 0
}
