---
name: deploy-lambda
description: 'Deploy AWS Lambda functions to the cloud. Use when pushing new Lambda code or infrastructure changes; follows the required sequence: unlock Terraform → apply infrastructure → deploy code.'
---

# Skill: Lambda Deployment

## Overview

Deploy AWS Lambda functions to cloud environment using deployment scripts.

## ⚠️ CRITICAL: Deployment Prerequisites

**ALWAYS follow this order**:

1. **Rebuild with `--skip-nx-cache`** to ensure the bundle includes your changes
2. **Clear Terraform locks** (if deploying infrastructure)
3. **Deploy infrastructure first** (if terraform changes exist)
4. **Then deploy Lambda code**

```powershell
# Complete deployment workflow:
pnpm exec nx run db:build --skip-nx-cache   # ALWAYS rebuild — cache may be stale
node scripts/terraform-unlock.js             # Clear any locks
cd terraform
terraform plan                               # Check infrastructure changes
terraform apply                              # Apply if needed
cd ..
.\scripts\deploy-lambda.ps1 -FunctionName graphql  # Deploy code
```

> **🚨 NEVER skip the `--skip-nx-cache` rebuild.**
> The deploy script detects a pre-built bundle and says "Using pre-built lambda"
> without rebuilding. If Nx served a cached build from before your code changes,
> you will deploy a **stale bundle** that does not include your new code.
> This has caused production incidents where new mutations/resolvers were missing.

## When to Use

- After Lambda code changes are merged
- Deploying hotfixes to production
- Initial Lambda setup
- Updating Lambda configuration
- Rolling back to previous version

## Standard Command

```powershell
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

**Available Functions**: `graphql`, `oauth-proxy`, `stats`, `game-selection`, `draft-processor`

**Note**: The `graphql` function is built from `lambdas/db` (the db project contains the GraphQL Lambda).

## Load-on-Demand References

- **[Deployment Guide](references/deployment-guide.md)** — Alternative commands, all common issues and fixes (wrong params, stale cache, Terraform locks, S3 path mismatch, permissions), full deployment workflow, hotfix process, rollback, monitoring, pre-deployment checklist

## Related Skills

- [Building](../build/SKILL.md) - Building Lambda before deploy
- [Testing](../test/SKILL.md) - Testing Lambda before deploy
- [Terraform Apply](../terraform-apply/SKILL.md) - Infrastructure changes

## Related Documentation

- [Lambda Build Strategy](../../../docs/deployment/lambda-build-strategy.md)
- [AWS Infrastructure](../../../docs/deployment/aws-infrastructure.md)

## Security Notes

- Never commit AWS credentials
- Use IAM roles with least privilege
- Test in dev before production
- Monitor logs after deployment
