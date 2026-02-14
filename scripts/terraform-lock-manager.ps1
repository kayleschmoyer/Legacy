#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Manage Terraform state locks in DynamoDB

.DESCRIPTION
    This script helps check for and clear stale Terraform state locks.
    Use this when a GitHub Actions workflow fails and leaves a lock in place.

.PARAMETER Action
    The action to perform: check, clear, or force-clear

.PARAMETER Region
    AWS region (default: us-east-1)

.EXAMPLE
    .\terraform-lock-manager.ps1 -Action check
    Check for any existing locks

.EXAMPLE
    .\terraform-lock-manager.ps1 -Action clear
    Clear locks if they exist (with confirmation)

.EXAMPLE
    .\terraform-lock-manager.ps1 -Action force-clear
    Clear locks without confirmation
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('check', 'clear', 'force-clear')]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [string]$Region = 'us-east-1'
)

$ErrorActionPreference = 'Stop'

$TABLE_NAME = 'terraform-state-locks'
$LOCK_PREFIX = 'legacy-sports-terraform-state/legacy-sports/terraform.tfstate'

function Get-TerraformLocks {
    Write-Host "🔍 Checking for Terraform locks..." -ForegroundColor Cyan
    
    $locks = aws dynamodb scan `
        --table-name $TABLE_NAME `
        --filter-expression "begins_with(LockID, :prefix)" `
        --expression-attribute-values ('{":prefix":{"S":"' + $LOCK_PREFIX + '"}}') `
        --region $Region `
        --output json 2>&1 | ConvertFrom-Json
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error querying DynamoDB: $locks" -ForegroundColor Red
        exit 1
    }
    
    return $locks.Items
}

function Remove-TerraformLock {
    param($LockID)
    
    Write-Host "🔓 Removing lock: $LockID" -ForegroundColor Yellow
    
    $key = "{`"LockID`":{`"S`":`"$LockID`"}}"
    
    aws dynamodb delete-item `
        --table-name $TABLE_NAME `
        --key $key `
        --region $Region | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Lock successfully removed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to remove lock" -ForegroundColor Red
        exit 1
    }
}

# Main execution
switch ($Action) {
    'check' {
        $locks = Get-TerraformLocks
        
        if ($locks.Count -eq 0) {
            Write-Host "✅ No locks found - Terraform state is clean" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Found $($locks.Count) lock(s):" -ForegroundColor Yellow
            foreach ($lock in $locks) {
                Write-Host "  - LockID: $($lock.LockID.S)" -ForegroundColor White
                if ($lock.Digest) {
                    Write-Host "    Digest: $($lock.Digest.S)" -ForegroundColor Gray
                }
                if ($lock.Info) {
                    Write-Host "    Info: $($lock.Info.S)" -ForegroundColor Gray
                }
            }
        }
    }
    
    'clear' {
        $locks = Get-TerraformLocks
        
        if ($locks.Count -eq 0) {
            Write-Host "✅ No locks found - nothing to clear" -ForegroundColor Green
            exit 0
        }
        
        Write-Host "⚠️  Found $($locks.Count) lock(s)" -ForegroundColor Yellow
        foreach ($lock in $locks) {
            Write-Host "  - $($lock.LockID.S)" -ForegroundColor White
        }
        
        $confirmation = Read-Host "`nDo you want to clear these locks? (y/N)"
        if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
            foreach ($lock in $locks) {
                Remove-TerraformLock -LockID $lock.LockID.S
            }
        } else {
            Write-Host "❌ Cancelled" -ForegroundColor Red
            exit 1
        }
    }
    
    'force-clear' {
        $locks = Get-TerraformLocks
        
        if ($locks.Count -eq 0) {
            Write-Host "✅ No locks found - nothing to clear" -ForegroundColor Green
            exit 0
        }
        
        Write-Host "⚠️  Force clearing $($locks.Count) lock(s)..." -ForegroundColor Yellow
        foreach ($lock in $locks) {
            Remove-TerraformLock -LockID $lock.LockID.S
        }
    }
}
