# DTE Quota Checking and Automatic Fallback

## Overview

The CI pipeline now includes intelligent Nx Cloud DTE (Distributed Task Execution) quota checking with automatic fallback to GitHub Actions runners when quota is exhausted.

## Features

### ✅ Pre-Flight Quota Check

Before starting the main CI run, the pipeline checks if DTE quota is available:

- **Available**: Full DTE usage with 8 agents
- **Limited**: Reduced DTE usage (4 agents)
- **Exhausted**: Automatic fallback to local GitHub Actions

### ✅ Mid-Execution Detection

During quality gates and test execution, the pipeline monitors for quota exhaustion:

- Detects quota errors in command output
- Automatically falls back to local execution
- Stops DTE agents gracefully
- Continues CI pipeline without manual intervention

### ✅ Comprehensive Reporting

Quota status is displayed throughout the CI pipeline:

- **Step Summaries**: Show quota status in GitHub Actions UI
- **PR Comments**: Include quota information in success/failure reports
- **Warnings**: Clear notifications when quota is exhausted

## How It Works

### 1. DTE Detection (`detect-dte` action)

```yaml
- name: '☁️ Detect Nx Cloud DTE Availability'
  uses: ./.github/actions/detect-dte
```

**Pre-flight check**:

- Attempts to start a test DTE session with 5-second timeout
- Checks for quota-related error messages
- Sets `quota-remaining` output: `available`, `limited`, `exhausted`, or `0`

**Outputs**:

- `dte-available`: Whether DTE can be used
- `execution-mode`: `distributed` or `local`
- `quota-remaining`: Current quota status
- `fallback-reason`: Why DTE wasn't used (if applicable)

### 2. Quality Gates with Fallback (`quality-gates` action)

```yaml
- name: '🔍 Quality Gates Validation'
  uses: ./.github/actions/quality-gates
  with:
    dte-available: ${{ steps.detect-dte.outputs.dte-available }}
```

**During execution**:

- Runs lint, typecheck, and test tasks
- Captures command output to log files
- Searches for quota-related error patterns: `quota`, `limit`, `exceeded`, `insufficient`

**If quota exhausted**:

1. Sets `DTE_QUOTA_EXHAUSTED=true` environment variable
2. Sets `dte-quota-exceeded=true` output
3. Stops all DTE agents gracefully
4. Returns success (allows fallback logic to trigger)

**Fallback execution**:

- Local execution step runs if `DTE_QUOTA_EXHAUSTED=true`
- Uses GitHub Actions runners with configured parallelism
- Continues pipeline without failure

### 3. CI Reporting with Quota Status

```yaml
- name: '📢 CI Pipeline Reporting'
  uses: ./.github/actions/ci-reporting
  with:
    quota-status: ${{ steps.detect-dte.outputs.quota-remaining }}
    quota-exceeded: ${{ steps.quality-gates.outputs.dte-quota-exceeded }}
```

**Displays quota information**:

- Step summaries in GitHub Actions UI
- PR comments (success and failure)
- Execution context with quota status

## Usage

No manual intervention required! The pipeline automatically:

1. ✅ Checks quota before CI run
2. ✅ Falls back to local if quota exhausted
3. ✅ Detects mid-execution quota exhaustion
4. ✅ Reports quota status clearly

## Quota Status Indicators

### In Step Summaries

```
📊 CI Performance Analysis
- Execution Mode: distributed
- Agents/Processes: 8
- DTE Quota: ✅ Available
```

```
📊 CI Performance Analysis
- Execution Mode: local
- Agents/Processes: 4
- DTE Status: ⚠️ Quota exceeded during execution - fell back to local runners
```

### In PR Comments

**Success with DTE:**

```markdown
### 📊 Execution Summary

- Mode: Distributed Task Execution (DTE)
- Agents/Processes: 8
- 🚀 Performance: 60-80% faster with Distributed Task Execution
- DTE Quota: ✅ Available
```

**Fallback after quota exhaustion:**

```markdown
### 📊 Execution Context

- Mode: Local GitHub Actions
- ⚠️ DTE Quota: Exhausted during execution - fell back to local runners
- Agents/Processes: 4
```

## Error Patterns Detected

The pipeline checks for these quota-related patterns:

- `quota exceeded`
- `quota limit reached`
- `insufficient quota`
- `DTE quota`
- Any case-insensitive variation

## Configuration

### Parallel Execution

When falling back to local execution:

- **Default**: 4 parallel processes
- **Configurable**: Adjust in `detect-dte` action based on runner resources

### Timeout

Pre-flight quota check timeout:

- **Default**: 5 seconds
- Allows DTE session to start without waiting forever
- Timeout is expected for successful DTE availability

## Troubleshooting

### Quota Always Shows "Exhausted"

**Cause**: Nx Cloud access token missing or invalid  
**Solution**: Ensure `NX_CLOUD_ACCESS_TOKEN` is set in repository secrets

### Pipeline Failing with Quota Errors

**Cause**: Fallback logic not triggering  
**Solution**: Check that `quality-gates` action has latest updates with quota detection

### No Quota Status in Reports

**Cause**: Outputs not passed to reporting action  
**Solution**: Ensure `ci-pipeline.yml` passes `quota-status` and `quota-exceeded` inputs

## Benefits

✅ **No Manual Intervention**: Automatic detection and fallback  
✅ **Continuous CI**: Pipeline never fails due to quota  
✅ **Clear Visibility**: Quota status always visible  
✅ **Cost Control**: Uses DTE when available, falls back when needed  
✅ **Developer Experience**: No confusion about quota-related failures

## Related Documentation

- [CI System Documentation](ci-system-documentation.md)
- [Nx Cloud Optimization Strategy](../build-and-tooling/nx-cloud-optimization-strategy.md)
- [CI Troubleshooting Guide](ci-troubleshooting-guide.md)

---

_Last Updated: Current implementation includes pre-flight checking and mid-execution detection._
