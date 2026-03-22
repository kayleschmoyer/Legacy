# Security Scanning Performance Optimization

## 📊 Current State Analysis

Your security scanning workflow is comprehensive but **takes a long time** due to:

### Time-Consuming Components

| Component            | Current Time | Main Issues                               |
| -------------------- | ------------ | ----------------------------------------- |
| **CodeQL Analysis**  | ~20 min      | Builds entire app, runs extensive queries |
| **Dependency Scans** | ~10 min      | npm audit + Snyk (sequential)             |
| **Secret Detection** | ~8 min       | GitLeaks + manual pattern matching        |
| **ESLint Security**  | ~5 min       | Full codebase scanning                    |
| **Total**            | **~43 min**  | All scans run comprehensively             |

## 🎯 Optimization Strategy

### Option 1: **Frequency-Based Optimization** (Recommended)

**Keep comprehensive scans, but run them less frequently:**

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    # Only run on PR if security-related files changed
    paths:
      - 'package*.json'
      - '**/*.ts'
      - '**/*.js'
      - '.github/workflows/security-scanning.yml'
  push:
    branches: [main]
    # Only run on main if security-related files changed
    paths:
      - 'package*.json'
      - '**/package.json'
  schedule:
    # Weekly comprehensive security scan (keep this!)
    - cron: '0 2 * * 1' # Every Monday at 2 AM UTC
  workflow_dispatch:
    # Manual trigger when needed
```

**Benefits:**

- ✅ Full security coverage maintained
- ✅ Fast PR feedback (only when needed)
- ✅ Weekly deep scans catch everything
- ✅ No security gaps

**Drawbacks:**

- ⚠️ Delayed detection (max 1 week)
- ⚠️ Only scans when certain files change

---

### Option 2: **Scope-Based Optimization** (Faster PRs)

**Run different scans based on context:**

#### For Pull Requests (Fast - ~5-10 min):

- ✅ Secret detection (always)
- ✅ npm audit only (skip Snyk)
- ❌ Skip CodeQL
- ❌ Skip ESLint security

#### For Main Branch (Medium - ~15-20 min):

- ✅ Secret detection
- ✅ Dependency scans (npm + Snyk)
- ✅ CodeQL (but don't build, use autobuild)
- ❌ Skip ESLint security

#### For Scheduled Scans (Full - ~43 min):

- ✅ Everything

**Implementation:**

```yaml
jobs:
  security-scan-plan:
    # ... existing code ...
    steps:
      - name: '📋 Determine Security Scan Scope'
        run: |
          # For PR events, focus on changed files for faster feedback
          if [ "$EVENT_NAME" == "pull_request" ]; then
            RUN_DEPS=true      # Quick npm audit only
            RUN_SAST=false     # Skip CodeQL
            RUN_SECRETS=true   # Always check secrets
            RUN_INFRA=false    # Skip
            SCAN_SCOPE="pr-fast"
          fi
```

---

### Option 3: **Parallel + Cache Optimization** (Fastest Comprehensive)

**Speed up the existing comprehensive scan:**

#### Optimizations:

1. **Parallelize Snyk** - Run npm audit and Snyk in parallel
2. **Cache CodeQL databases** - Reuse analysis between runs
3. **Skip builds for CodeQL** - Use autobuild instead
4. **Limit ESLint scope** - Only changed files on PRs
5. **Use GitHub Actions caching**

**Time Reduction: ~43 min → ~20-25 min**

```yaml
dependency-scan:
  strategy:
    matrix:
      tool: [npm-audit, snyk]
  steps:
    - name: 'Run ${{ matrix.tool }}'
      run: |
        if [ "${{ matrix.tool }}" == "npm-audit" ]; then
          npm audit --audit-level=moderate --json > audit.json
        else
          snyk test --json > snyk.json
        fi
```

---

## 🏆 Recommended Solution: **Hybrid Approach**

Combine all three strategies for best results:

### 1. **Change Path Filtering** (saves ~80% of runs)

```yaml
on:
  pull_request:
    paths:
      - 'package*.json'
      - '**/package.json'
      - '**/*.ts'
      - '**/*.js'
      - '**/*.tsx'
      - '**/*.jsx'
```

### 2. **Scope-Based Execution** (saves time when it does run)

- **PR**: Secrets + npm audit only (~5 min)
- **Main**: Secrets + npm audit + Snyk (~12 min)
- **Weekly**: Full scan (~25 min with optimizations)

### 3. **Performance Optimizations**

- Parallelize npm audit and Snyk
- Use CodeQL autobuild (skip manual build)
- Cache dependencies and analysis results
- Limit ESLint to changed files on PRs

### Expected Results:

| Context                     | Before | After           | Savings |
| --------------------------- | ------ | --------------- | ------- |
| **PR (no package changes)** | 43 min | 0 min (skipped) | 100%    |
| **PR (package changes)**    | 43 min | 5 min           | 88%     |
| **Main branch push**        | 43 min | 12 min          | 72%     |
| **Weekly scheduled**        | 43 min | 25 min          | 42%     |

---

## 📝 Implementation Plan

### Phase 1: Path-Based Filtering (Immediate - 5 min)

```yaml
# Add to security-scanning.yml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - 'package*.json'
      - '**/package.json'
      - 'apps/**/*.{ts,tsx,js,jsx}'
      - 'lib/**/*.{ts,tsx,js,jsx}'
      - 'lambdas/**/*.{ts,js}'
      - '.github/workflows/security-scanning.yml'
```

### Phase 2: Scope Optimization (15 min)

Update the security-scan-plan job to be more aggressive about skipping scans for PRs.

### Phase 3: Parallelization (30 min)

Convert dependency-scan to use matrix strategy for parallel execution.

### Phase 4: CodeQL Optimization (15 min)

Remove manual build step, use autobuild feature.

---

## ⚡ Quick Wins (Implement Today)

### 1. Add Path Filtering

**Time saved per PR: ~43 min (when files don't match)**

### 2. Skip CodeQL on PRs

**Time saved per PR with package changes: ~20 min**

### 3. Skip Snyk on PRs

**Time saved per PR: ~3-5 min**

### Total Impact:

- **PRs without security changes**: Skip entirely
- **PRs with package.json changes**: 5 min instead of 43 min
- **Weekly scans**: Keep comprehensive (important!)

---

## 🚫 What NOT to Do

❌ **Don't disable weekly scans** - This is your safety net  
❌ **Don't skip secret detection on PRs** - Catches leaks early  
❌ **Don't remove npm audit** - Fast and critical  
❌ **Don't skip all scans on main** - Needs reasonable coverage

---

## 📊 Recommended Configuration

See the optimized workflow in the next section for a complete implementation.
