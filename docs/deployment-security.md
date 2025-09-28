# Lambda Deployment Security Configuration

## 🔒 Deployment Triggers

All Lambda deployment workflows now have secure trigger configurations:

### ✅ **Automatic Deployment Triggers**

- **Main Branch Merge**: Deployments automatically run when code is merged into `main`
- **Path-Based Filtering**: Only triggers when relevant files change:
  - `lambdas/db/**` → GraphQL Lambda deployment
  - `lambdas/stats-lambda/**` → Stats Lambda deployment
  - `lambdas/oauth-proxy/**` → OAuth Proxy Lambda deployment
  - Workflow file changes also trigger deployments

### ✅ **Manual Deployment Triggers**

- **GitHub UI Button**: `workflow_dispatch` allows manual triggering from GitHub Actions tab
- **Branch Verification**: Additional safety check ensures deployment only runs from `main` branch

## 🛡️ Security Safeguards

### Environment Protection

- All deployment jobs run in `production` environment
- Requires environment approval rules (if configured in GitHub)
- Provides audit trail for all deployments

### Branch Verification

```yaml
- name: Verify Main Branch
  run: |
    if [ "${{ github.ref }}" != "refs/heads/main" ]; then
      echo "❌ Deployment can only run from main branch"
      echo "Current branch: ${{ github.ref }}"
      exit 1
    fi
    echo "✅ Deploying from main branch"
```

### Concurrency Control

```yaml
concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: true
```

## 📋 Updated Workflows

### 1. **GraphQL Lambda** (`publish-gql.yml`)

```yaml
on:
  workflow_dispatch: # Manual trigger via GitHub UI
  push:
    branches: [main] # Only main branch
    paths:
      - 'lambdas/db/**' # Only when GraphQL code changes
      - '.github/workflows/publish-gql.yml'
```

### 2. **Stats Lambda** (`publish-stats-lambda.yml`)

```yaml
on:
  workflow_dispatch: # Manual trigger via GitHub UI
  push:
    branches: [main] # Only main branch
    paths:
      - 'lambdas/stats-lambda/**' # Only when Stats code changes
      - '.github/workflows/publish-stats-lambda.yml'
```

### 3. **OAuth Proxy Lambda** (`publish-oauth-proxy.yml`)

```yaml
on:
  workflow_dispatch: # Manual trigger via GitHub UI
  push:
    branches: [main] # Only main branch
    paths:
      - 'lambdas/oauth-proxy/**' # Only when OAuth code changes
      - '.github/workflows/publish-oauth-proxy.yml'
```

## 🎯 Deployment Flow

### **Automatic Flow (Main Branch Merge)**

1. Developer creates PR with Lambda changes
2. PR is reviewed and approved
3. PR is merged into `main` branch
4. GitHub Actions automatically detects changes
5. Relevant Lambda deployment workflow triggers
6. Branch verification passes
7. Environment protection applies (if configured)
8. Lambda is built, uploaded to S3, and deployed

### **Manual Flow (GitHub UI)**

1. Navigate to GitHub Actions tab
2. Select desired Lambda deployment workflow
3. Click "Run workflow" button
4. Ensure you're on `main` branch
5. Click "Run workflow" to start
6. Branch verification passes
7. Environment protection applies (if configured)
8. Lambda is built, uploaded to S3, and deployed

## 🚫 What Won't Trigger Deployments

- ❌ Pushes to feature branches
- ❌ Pushes to `develop` or other non-main branches
- ❌ Changes to unrelated files (docs, configs, etc.)
- ❌ Draft PRs or WIP commits
- ❌ Manual workflow dispatch from non-main branches (will fail verification)

## 📊 Security Benefits

1. **Controlled Deployments**: Only production-ready code from main branch
2. **Change Isolation**: Each Lambda only deploys when its code changes
3. **Manual Override**: Ability to deploy manually when needed
4. **Audit Trail**: All deployments logged in GitHub Actions
5. **Environment Protection**: Additional approval gates (if configured)
6. **Concurrent Safety**: Prevents multiple simultaneous deployments

## 🔧 GitHub Environment Configuration (Optional)

To add additional protection, configure a `production` environment in GitHub:

1. Go to Repository → Settings → Environments
2. Create `production` environment
3. Add protection rules:
   - Required reviewers
   - Wait timer
   - Deployment branches restriction
4. Add environment secrets if needed

This will require manual approval before any deployment runs, even with the workflow triggers.

## ✅ Verification Steps

After merging these changes:

1. **Test Path Filtering**: Make a change only to GraphQL code, verify only GraphQL workflow triggers
2. **Test Branch Protection**: Try manual deployment from feature branch, verify it fails
3. **Test Manual Trigger**: Use GitHub UI to manually trigger deployment from main branch
4. **Test Environment Protection**: If configured, verify approval flow works

The deployment system now provides multiple layers of security while maintaining flexibility for both automatic and manual deployments.
