# CI System Troubleshooting & Debugging Guide

## Overview

This guide provides comprehensive troubleshooting information for the improved Legacy Sports CI system. The new CI prioritizes **visibility and easy debugging** over the previous complex multi-job setup.

## 🚀 Quick Start: Understanding CI Failures

### Step 1: Check the CI Summary

Every CI run generates a comprehensive summary at the bottom of the workflow. Look for:

```markdown
# 📋 CI Pipeline Report

## Pipeline Status: ❌ FAILED

### Stage Results

| Stage            | Component    | Status    |
| ---------------- | ------------ | --------- | ---------------------- |
| **Code Quality** | Format Check | ✅ Passed |
|                  | ESLint       | ❌ Failed | ← This is your problem |
|                  | TypeScript   | ✅ Passed |
```

### Step 2: Find the Failing Step

Click on the failed step in the GitHub Actions UI. Look for:

- **Red ❌ indicators** showing exactly what failed
- **Structured error messages** with file names and line numbers
- **Local reproduction commands** starting with `::notice::`

### Step 3: Reproduce Locally

Every failing step includes a command to reproduce the issue locally:

```bash
# Example from a failed ESLint step
pnpm exec nx affected -t lint --base=origin/main --head=HEAD
```

## 🔍 Debugging by Failure Type

### Code Quality Failures

#### ESLint Failures

**Symptoms**: `🔧 ESLint Validation` step fails
**Common Causes**:

- New code violating linting rules
- Import/export ordering issues
- TypeScript type safety violations

**Debugging Steps**:

```bash
# 1. Reproduce locally
pnpm exec nx affected -t lint --base=origin/main --head=HEAD

# 2. Auto-fix common issues
pnpm exec nx affected -t lint --fix --base=origin/main --head=HEAD

# 3. Check specific files mentioned in CI logs
pnpm exec nx lint specific-project-name
```

**Example CI Error Message**:

```
❌ ESLint validation failed
## ESLint Errors Summary
apps/web/src/components/PlayerCard.tsx
  42:1  error  'React' is not defined  no-undef
  45:3  error  Missing return type on function  @typescript-eslint/explicit-function-return-type
```

**Fix**:

```typescript
// Add missing import
import React from 'react';

// Add return type
function PlayerCard(): React.ReactElement {
  return <div>...</div>;
}
```

#### Format Check Failures

**Symptoms**: `🎨 Code Formatting Check` step fails
**Quick Fix**:

```bash
# Fix all formatting issues
pnpm exec nx format:write

# Check what files need formatting
pnpm exec nx format:check
```

#### TypeScript Failures

**Symptoms**: `📝 TypeScript Type Check` step fails
**Debugging**:

```bash
# Check type errors for affected projects
pnpm exec nx affected -t typecheck --base=origin/main --head=HEAD

# Check specific project
pnpm exec nx typecheck specific-project-name

# Build to see compilation errors
pnpm exec nx build specific-project-name
```

### Build Failures

#### Web Build Failures

**Symptoms**: `📦 Build Web Application` step fails
**Common Causes**:

- Missing environment variables
- Import/export issues
- Asset loading problems
- Bundle size issues

**Debugging Steps**:

```bash
# 1. Reproduce the build
pnpm exec nx build web

# 2. Check for missing dependencies
npm ci

# 3. Verify environment setup
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with appropriate values

# 4. Check bundle analysis
pnpm exec nx build web --analyze
```

**Example Error & Fix**:

```
❌ Web application build failed
## Build Errors Summary
ERROR in ./apps/web/src/main.tsx
Module not found: Error: Can't resolve '@legacy-sports/shared-components'
```

**Fix**: Check if the import path is correct and the package exists in `lib/shared-components`.

#### Lambda Build Failures

**Symptoms**: `⚡ Build Lambda Functions` step fails
**Debugging**:

```bash
# Build specific lambda
pnpm exec nx build lambdas-oauth-proxy

# Package lambda for testing
pnpm exec nx package lambdas-oauth-proxy

# Check lambda dependencies
cd lambdas/oauth-proxy && npm ci
```

#### Mobile Build Failures

**Symptoms**: Mobile validation fails or platform builds fail
**Debugging**:

```bash
# Check mobile configuration
pnpm exec nx build app --dry-run

# For iOS issues (requires macOS)
pnpm exec nx build app --platform=ios

# For Android issues
pnpm exec nx build app --platform=android
```

### Test Failures

#### Unit Test Failures

**Symptoms**: `🧪 Unit Tests` step fails
**Debugging**:

```bash
# Run tests for affected projects
pnpm exec nx affected -t test --base=origin/main --head=HEAD

# Run specific test file
pnpm exec nx test shared-components --testPathPattern=AuthProvider

# Run tests in watch mode for debugging
pnpm exec nx test shared-components --watch
```

**Example CI Test Failure**:

```
❌ Unit tests failed
## Failed Tests Summary
 FAIL  lib/shared-components/src/auth/AuthProvider.test.tsx
   ● AuthProvider › should handle login flow
     expect(received).toBe(expected) // Object.is equality
     Expected: "authenticated"
     Received: "loading"
```

**Fix**: Check if the test is properly waiting for async operations or if the component state is being updated correctly.

#### Integration Test Failures

**Symptoms**: `🔄 Integration Tests` step fails
**Debugging**:

```bash
# Run integration tests locally
pnpm run test:integration

# Check database connectivity (if applicable)
pnpm run db:test

# Check environment variables
pnpm run sync-env
```

## 🛠 Advanced Debugging Techniques

### Accessing CI Artifacts

Every CI run uploads artifacts for debugging:

1. **Go to the failed workflow run**
2. **Scroll to bottom** to find "Artifacts" section
3. **Download** `ci-pipeline-logs-<run-id>`
4. **Extract and examine** specific log files

**Key artifact files**:

- `execution-plan.json` - Shows what the CI planned to do
- `test-context.json` - Test execution context
- `ci-report.json` - Complete pipeline status
- `*.log` files - Detailed logs from each step

### Debug Mode

Enable verbose logging by adding the `ci-debug` label to your PR:

```bash
# Via GitHub CLI
gh pr edit --add-label ci-debug

# Via GitHub Web UI
# Add "ci-debug" label in the PR sidebar
```

This enables:

- Verbose Nx logging
- Extended error context
- Additional debugging output
- Longer log retention

### Local CI Simulation

Reproduce the entire CI pipeline locally:

```bash
#!/bin/bash
# scripts/simulate-ci.sh

echo "🚀 Simulating CI Pipeline Locally"

# Setup (matches CI environment)
export NX_DAEMON=false
export NX_PARALLEL=4
export NODE_OPTIONS="--max_old_space_size=4096"

# Stage 1: Code Quality
echo "🎨 Code Quality Checks"
pnpm exec nx format:check --base=origin/main --head=HEAD
pnpm exec nx affected -t lint --base=origin/main --head=HEAD
pnpm exec nx affected -t typecheck --base=origin/main --head=HEAD

# Stage 2: Testing
echo "🧪 Testing"
pnpm exec nx affected -t test --base=origin/main --head=HEAD

# Stage 3: Building
echo "📦 Building"
pnpm exec nx affected -t build --base=origin/main --head=HEAD

echo "✅ Local CI simulation complete"
```

## 📊 Performance Debugging

### Slow CI Runs

If CI is running slower than expected:

1. **Check Nx Cache**:

   ```bash
   # Clear local cache if needed
   pnpm exec nx reset

   # Check cache hit rates in CI logs
   grep "cache hit" *.log
   ```

2. **Analyze Build Times**:

   ```bash
   # Run with verbose timing
   pnpm exec nx affected -t build --verbose

   # Check for large bundle sizes
   pnpm exec nx build web --analyze
   ```

3. **Check Parallelization**:
   - Verify `NX_PARALLEL=4` is being used
   - Look for dependency bottlenecks in task graph

### Memory Issues

**Symptoms**: "JavaScript heap out of memory" errors
**Solutions**:

```bash
# Increase heap size locally
export NODE_OPTIONS="--max_old_space_size=8192"

# Check memory usage during builds
node --max-old-space-size=8192 ./node_modules/.bin/nx build web
```

## 🚨 Common Issues & Quick Fixes

### Issue: "Deprecated GitHub Actions" errors

**Symptoms**: CI fails with errors like:

```
Error: This request has been automatically failed because it uses a
deprecated version of `actions/upload-artifact: v3`. Learn more:
https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/
```

**Cause**: Workflow uses outdated GitHub Actions versions
**Fix**: Update actions to latest versions in `.github/workflows/ci-pipeline-improved.yml`:

```yaml
# Update these actions to latest versions:
- uses: actions/upload-artifact@v4 # was v3
- uses: actions/cache@v4 # was v3
- uses: actions/setup-java@v4 # was v3
- uses: actions/checkout@v4 # should already be v4
- uses: actions/setup-node@v4 # should already be v4
```

**Prevention**: Regularly check for action updates using:

```bash
# Check current action versions
grep -r "uses: actions/" .github/workflows/

# Look for deprecated versions (v1, v2, v3)
grep -r "@v[1-3]$" .github/workflows/
```

### Issue: "Nx affected finds no projects"

**Cause**: Base branch not set correctly
**Fix**:

```bash
# Set correct base for affected detection
git fetch origin main
pnpm exec nx affected -t build --base=origin/main --head=HEAD
```

### Issue: "Module not found" errors

**Cause**: Dependencies not installed or stale lockfile
**Fix**:

```bash
# Clean install
rm -rf node_modules package-lock.json
pnpm install

# Or update specific dependencies
npm ci --prefer-offline
```

### Issue: Platform builds failing

**Cause**: Platform-specific dependencies or configuration
**Fix**:

```bash
# Check platform requirements
pnpm exec nx build app --dry-run

# Verify mobile dependencies
cd apps/app && pnpm exec expo doctor

# Check iOS dependencies (macOS only)
cd ios && pod install
```

### Issue: Deployment validation fails

**Cause**: Terraform configuration or AWS credentials
**Fix**:

```bash
# Validate terraform locally
cd terraform
terraform init -backend=false
terraform validate

# Check AWS credentials (for maintainers)
aws sts get-caller-identity
```

## 🔄 Error Recovery Patterns

### Pattern 1: Transient Failures

**Symptoms**: Random failures that don't reproduce locally
**Recovery**:

1. Re-run the failed workflow
2. Check GitHub Actions service status
3. Look for external service dependencies

### Pattern 2: Environment Issues

**Symptoms**: "Permission denied" or "Command not found"
**Recovery**:

1. Check if CI environment matches local setup
2. Verify all required tools are installed in CI
3. Check file permissions and execution flags

### Pattern 3: Race Conditions

**Symptoms**: Tests pass locally but fail in CI
**Recovery**:

1. Look for async operations without proper awaits
2. Check test timeouts and timing assumptions
3. Add appropriate delays or polling in tests

## 📋 Escalation Procedures

### Level 1: Self-Service (First 15 minutes)

- Check CI summary for obvious failures
- Reproduce locally using provided commands
- Apply quick fixes (formatting, linting)
- Re-run workflow if it looks like a transient failure

### Level 2: Team Support (15-30 minutes)

- Post in #engineering Slack with:
  - Link to failed CI run
  - Error message from CI summary
  - Steps you've already tried
- Check recent commits for similar issues
- Review recent changes to CI configuration

### Level 3: DevOps Escalation (30+ minutes)

- Create GitHub issue with "ci-issue" label
- Include complete error logs and reproduction steps
- Tag @devops-team in Slack
- Consider temporary workarounds if blocking

### Emergency Procedures

For CI failures blocking critical deployments:

1. **Immediate**: Contact DevOps lead via emergency phone
2. **Short-term**: Use manual deployment procedures if available
3. **Communication**: Update #incidents channel with status
4. **Long-term**: Root cause analysis and prevention plan

## 📚 Additional Resources

### Documentation Links

- [Nx Documentation](https://nx.dev/getting-started/intro) - Nx workspace management
- [GitHub Actions Docs](https://docs.github.com/en/actions) - CI/CD platform documentation
- [Project Architecture Guide](../AGENTS.md) - Legacy Sports specific architecture

### Useful Commands Reference

```bash
# Nx Commands
pnpm exec nx affected -t <task> --base=origin/main --head=HEAD  # Run task on affected projects
pnpm exec nx show projects --affected --base=origin/main        # See affected projects
pnpm exec nx graph --affected --base=origin/main               # Visualize affected dependencies
pnpm exec nx reset                                             # Clear Nx cache

# Git Commands
git fetch origin main                                    # Update main branch reference
git log --oneline origin/main..HEAD                     # See commits in current branch
git diff --name-only origin/main...HEAD                 # See changed files

# Debugging Commands
pnpm run sync-env                                         # Sync database credentials
pnpm run db:test                                         # Test database connectivity
make typecheck                                          # Type check all projects
make lint:fix                                          # Auto-fix linting issues
```

### Team Contacts

- **DevOps Lead**: @devops-lead (GitHub), #devops-alerts (Slack)
- **CI Maintainers**: @ci-team (GitHub), #engineering (Slack)
- **Emergency Contact**: See team directory for 24/7 rotation

This troubleshooting guide should help you quickly identify and resolve most CI issues in the improved system. The key is to follow the structured approach: check the summary, find the failing step, and reproduce locally using the provided commands.
