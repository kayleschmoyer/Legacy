> **Archived 2026-04-27.** This document describes a system that has been replaced. See [ci-greenfield-design.md](../ci-greenfield-design.md) for the current architecture.

---

# Improved CI System Design for Legacy Sports

## Overview

This document outlines a redesigned CI/CD system that prioritizes **visibility, simplicity, and easy debugging** while maintaining all current functionality. The new system addresses the complexity and debugging challenges of the current multi-job, distributed execution setup.

## 🎯 Design Goals

### Primary Objectives

1. **Visibility First**: Every failure should be immediately clear and actionable
2. **Simple Architecture**: Minimize job dependencies and conditional logic
3. **Fast Debugging**: Clear logs, proper error isolation, and structured reporting
4. **Maintain Performance**: Keep build times reasonable without sacrificing clarity
5. **Zero Functionality Loss**: Support all current features (mobile, web, lambdas, etc.)

### Key Improvements Over Current System

- ✅ **Single Point of Truth**: One comprehensive workflow instead of 6+ separate jobs
- ✅ **Clear Failure Isolation**: Each step reports exactly what failed and why
- ✅ **Consistent Error Handling**: Standardized timeouts, retries, and error reporting
- ✅ **Simplified Execution**: Eliminate complex Nx Cloud distributed execution complexity
- ✅ **Structured Logging**: Consistent, searchable log format across all steps
- ✅ **Easy Local Reproduction**: All CI steps can be reproduced locally with simple commands

## 🏗️ New Architecture

### Core Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMPLIFIED CI ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Single Workflow with Sequential Steps                          │
│  ├─ 1. Environment Setup & Validation                          │
│  ├─ 2. Code Quality (lint, format, typecheck)                  │
│  ├─ 3. Unit Tests (with proper isolation)                      │
│  ├─ 4. Build Validation (all platforms)                        │
│  ├─ 5. Platform-Specific Tests (mobile, web, lambdas)          │
│  ├─ 6. Deployment Readiness Check                              │
│  └─ 7. Comprehensive Summary Report                            │
│                                                                 │
│  Key Features:                                                  │
│  ✅ Clear step-by-step execution                               │
│  ✅ Fail-fast with detailed error context                      │
│  ✅ Structured JSON logging for parsing                        │
│  ✅ Local execution optimization (no cloud complexity)         │
│  ✅ Platform detection with smart caching                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 Workflow Structure

### 1. **Single Main Workflow**: `ci-pipeline.yml`

Instead of multiple separate workflows, we use **one comprehensive pipeline** with clear stages:

```yaml
name: CI Pipeline

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]
  merge_group:

jobs:
  ci-pipeline:
    name: 'CI Pipeline'
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      # Stage 1: Setup & Validation
      - name: '🚀 Setup Environment'
      - name: '🔍 Detect Changed Files'
      - name: '📊 Generate Execution Plan'

      # Stage 2: Code Quality
      - name: '🎨 Code Formatting Check'
      - name: '🔧 ESLint Validation'
      - name: '📝 TypeScript Type Check'

      # Stage 3: Testing
      - name: '🧪 Unit Tests (Affected Projects)'
      - name: '🔄 Integration Tests (If Database Changes)'

      # Stage 4: Build Validation
      - name: '📦 Build Web Application'
      - name: '📱 Build Mobile Applications' # Only if mobile affected
      - name: '⚡ Build Lambda Functions' # Only if lambdas affected

      # Stage 5: Deployment Checks
      - name: '🔐 AWS Infrastructure Validation' # Only if terraform changes
      - name: '🌐 Deployment Readiness Check'

      # Stage 6: Summary
      - name: '📋 Generate CI Report'
```

### 2. **Platform-Specific Jobs**: Only When Needed

For platform-specific builds that require different runners:

```yaml
ios-build:
  name: 'iOS Build'
  runs-on: macos-latest
  needs: [ci-pipeline]
  if: needs.ci-pipeline.outputs.ios-affected == 'true'
  timeout-minutes: 30

android-build:
  name: 'Android Build'
  runs-on: ubuntu-latest
  needs: [ci-pipeline]
  if: needs.ci-pipeline.outputs.android-affected == 'true'
  timeout-minutes: 25
```

## 🎯 Key Improvements

### 1. **Visibility & Debugging**

#### **Structured Error Reporting**

```yaml
- name: '🧪 Unit Tests'
  run: |
    echo "::group::Starting Unit Tests"

    # Create structured log entry
    cat > test-context.json << EOF
    {
      "step": "unit-tests",
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "affected_projects": $(echo '${{ steps.detect-changes.outputs.affected-projects }}' | jq -c .),
      "execution_mode": "local-optimized"
    }
    EOF

    # Run tests with proper error capture
    if pnpm exec nx affected -t test --parallel=4 --verbose 2>&1 | tee test-output.log; then
      echo "✅ All tests passed"
      echo "test-result=success" >> $GITHUB_OUTPUT
    else
      echo "❌ Tests failed - generating detailed report"
      
      # Parse test failures for clear reporting
      grep -E "(FAIL|ERROR|Failed)" test-output.log || true
      echo "test-result=failure" >> $GITHUB_OUTPUT
      echo "::error::Unit tests failed. See test-output.log for details."
      exit 1
    fi

    echo "::endgroup::"
```

#### **Smart Failure Context**

- **Before**: Generic "Build failed" with logs scattered across multiple jobs
- **After**: "TypeScript compilation failed in lib/shared-components/src/auth/AuthProvider.tsx:42 - Property 'userId' does not exist on type 'User'"

### 2. **Execution Plan Transparency**

```yaml
- name: '📊 Generate Execution Plan'
  id: execution-plan
  run: |
    echo "::group::CI Execution Plan"

    # Detect what needs to run based on changes
    CHANGED_FILES='${{ steps.detect-changes.outputs.files }}'

    # Generate clear execution plan
    cat > execution-plan.json << EOF
    {
      "web_affected": ${{ steps.detect-changes.outputs.web == 'true' }},
      "mobile_affected": ${{ steps.detect-changes.outputs.mobile == 'true' }},
      "lambdas_affected": ${{ steps.detect-changes.outputs.lambdas == 'true' }},
      "terraform_affected": ${{ steps.detect-changes.outputs.terraform == 'true' }},
      "estimated_duration_minutes": 15,
      "parallel_execution": true
    }
    EOF

    # Display plan in human-readable format
    echo "## 📋 CI Execution Plan"
    echo ""
    echo "| Component | Status | Reason |"
    echo "|-----------|--------|--------|"
    echo "| Web App | ${{ steps.detect-changes.outputs.web == 'true' && '✅ Will Build' || '⏭️ Skipped' }} | ${{ steps.detect-changes.outputs.web == 'true' && 'Files changed in apps/web' || 'No changes detected' }} |"
    echo "| Mobile | ${{ steps.detect-changes.outputs.mobile == 'true' && '✅ Will Build' || '⏭️ Skipped' }} | ${{ steps.detect-changes.outputs.mobile == 'true' && 'Files changed in apps/app' || 'No changes detected' }} |"
    echo "| Lambdas | ${{ steps.detect-changes.outputs.lambdas == 'true' && '✅ Will Build' || '⏭️ Skipped' }} | ${{ steps.detect-changes.outputs.lambdas == 'true' && 'Files changed in lambdas/' || 'No changes detected' }} |"

    echo "::endgroup::"
```

### 3. **Local Execution Optimization**

Remove Nx Cloud complexity and optimize for GitHub Actions runners:

```yaml
env:
  # Optimized for GitHub Actions (no cloud complexity)
  NX_DAEMON: false
  NX_PARALLEL: 4
  NX_CACHE_DIRECTORY: .nx-cache
  NX_SKIP_NX_CACHE: false
  NODE_OPTIONS: '--max_old_space_size=4096'
```

### 4. **Consistent Error Handling Pattern**

```yaml
# Standard error handling template used in every step
- name: 'Step Template'
  id: step-id
  continue-on-error: false
  timeout-minutes: 10
  run: |
    echo "::group::Step Name"

    # Set error context
    ERROR_CONTEXT="step-name-$(date +%s)"

    # Run the actual task with proper error capture
    if COMMAND_HERE 2>&1 | tee "${ERROR_CONTEXT}.log"; then
      echo "✅ Step completed successfully"
      echo "result=success" >> $GITHUB_OUTPUT
    else
      echo "❌ Step failed"
      echo "::error::Step Name failed. Check ${ERROR_CONTEXT}.log for details."
      echo "result=failure" >> $GITHUB_OUTPUT
      
      # Upload failure context for debugging
      echo "error-log=${ERROR_CONTEXT}.log" >> $GITHUB_OUTPUT
      exit 1
    fi

    echo "::endgroup::"
```

### 5. **Smart Platform Detection**

```yaml
- name: '🔍 Detect Changed Files'
  id: detect-changes
  uses: dorny/paths-filter@v2
  with:
    filters: |
      web:
        - 'apps/web/**'
        - 'lib/shared-components/**'
      mobile:
        - 'apps/app/**'
        - 'lib/shared-components/**'
      lambdas:
        - 'lambdas/**'
        - 'lib/api/**'
        - 'lib/db-client/**'
      terraform:
        - 'terraform/**'
      package-json:
        - '**/package.json'
        - 'package-lock.json'
```

## 📈 Performance Improvements

### Build Time Optimization

| Current System                                 | New System                                          | Improvement      |
| ---------------------------------------------- | --------------------------------------------------- | ---------------- |
| **PR Validation**: 25-45 min (6 jobs)          | **CI Pipeline**: 15-25 min (1 job + conditionals)   | **40% faster**   |
| **Debugging Time**: 15-30 min (scattered logs) | **Error Identification**: 2-5 min (structured logs) | **80% faster**   |
| **Setup Complexity**: High (Nx Cloud setup)    | **Setup Complexity**: Low (standard GitHub Actions) | **Much simpler** |

### Caching Strategy

```yaml
- name: '📦 Setup Caching'
  uses: actions/cache@v3
  with:
    path: |
      ~/.npm
      node_modules
      .nx-cache
    key: ${{ runner.os }}-build-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-build-
```

## 🔧 Debugging Features

### 1. **Failure Artifacts**

```yaml
- name: '📋 Upload Failure Artifacts'
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: ci-failure-logs-${{ github.run_id }}
    path: |
      **/*.log
      execution-plan.json
      test-context.json
    retention-days: 7
```

### 2. **Interactive Debugging Mode**

```yaml
- name: '🐛 Debug Mode'
  if: contains(github.event.pull_request.labels.*.name, 'ci-debug')
  run: |
    echo "🐛 Debug mode activated - detailed logging enabled"
    echo "NX_VERBOSE_LOGGING=true" >> $GITHUB_ENV
    echo "DEBUG=nx:*" >> $GITHUB_ENV
```

### 3. **Local Reproduction Commands**

Every CI step includes local reproduction instructions:

```yaml
- name: '🧪 Unit Tests'
  run: |
    echo "::notice::To reproduce locally: pnpm run test:affected"
    # ... rest of test execution
```

## 🚀 Migration Strategy

### Phase 1: Parallel Implementation (Week 1)

- Create new workflow alongside existing ones
- Test on feature branches with `ci-new` label
- Compare results and performance

### Phase 2: Gradual Rollout (Week 2)

- Enable for all PRs in parallel with old system
- Monitor for any missed edge cases
- Collect developer feedback

### Phase 3: Full Migration (Week 3)

- Disable old workflows
- Update documentation
- Clean up old custom actions

## 📚 Documentation & Training

### Developer Guide Sections

1. **"Understanding CI Failures"** - How to read error messages and logs
2. **"Local Debugging"** - Reproducing CI issues locally
3. **"Performance Optimization"** - Best practices for fast builds
4. **"Adding New Checks"** - How to extend the CI pipeline

### Troubleshooting Runbook

- **Common Failure Patterns** with solutions
- **Performance Issues** debugging steps
- **Emergency Procedures** for critical failures

## 🎯 Success Metrics

### Debugging Efficiency

- **Time to identify failure root cause**: Target < 5 minutes
- **Time to reproduce locally**: Target < 2 minutes
- **False positive rate**: Target < 5%

### Developer Experience

- **Build feedback speed**: Target < 20 minutes for full validation
- **CI reliability**: Target > 95% success rate for valid PRs
- **Developer satisfaction**: Target > 4.5/5 survey score

This improved system transforms the current complex, hard-to-debug CI into a **simple, transparent, and highly debuggable** pipeline while maintaining all existing functionality.