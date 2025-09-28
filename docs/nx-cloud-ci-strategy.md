# Nx Cloud CI Strategy Update

## Overview

This document describes the updated CI strategy for testing Nx Cloud availability and conditionally setting environment variables for optimal build performance.

## New Approach

### 1. Early Cloud Testing

- **Test First**: Each workflow now tests Nx Cloud availability and quota status before setting execution environment variables
- **Conditional Configuration**: Environment variables are only set after successful cloud testing
- **Fail-Safe Fallback**: If cloud testing fails, workflows automatically configure for local execution

### 2. Workflow Changes

#### Updated Workflows:

- `pr-validation.yml` - Pull request validation with cloud testing
- `integration-build.yml` - Integration builds with cloud testing
- Setup action simplified to remove duplicate cloud logic

#### New Step Flow:

1. **Checkout & Setup** - Standard repository and dependency setup
2. **Test Nx Cloud** - Early cloud availability and quota testing
3. **Configure Execution** - Set environment variables based on test results
4. **Start Distributed CI** - Conditionally start cloud agents (only if cloud available)
5. **Execute Tasks** - Run builds with optimized configuration

### 3. Environment Variable Strategy

#### Default (Conservative Local Settings):

```yaml
env:
  NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}
  NX_DAEMON: false
  NX_CLOUD_TIMEOUT: 300000
  NX_PARALLEL: 2 # Conservative for stability
  NX_CLOUD_DISTRIBUTED_EXECUTION: false
```

#### Cloud Available Configuration:

```bash
NX_CLOUD_DISTRIBUTED_EXECUTION=true
NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT=8  # PR: 8, Integration: 6
NX_CLOUD_ID=68ce3a86265b78d5c0375b68
NX_PARALLEL=4
NX_LOCAL_FALLBACK=false
NX_CLOUD_NO_TIMEOUTS=true
```

#### Cloud Unavailable Configuration:

```bash
NX_CLOUD_DISTRIBUTED_EXECUTION=false
NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT=0
NX_CLOUD_ID=  # Clear to prevent connection attempts
NX_PARALLEL=2  # Conservative for stability
NX_LOCAL_FALLBACK=true
NX_CLOUD_ACCESS_TOKEN=  # Clear to prevent connection attempts
```

### 4. Script Enhancements

#### Updated `nx-cloud-fallback.sh`:

- **Test-Only Mode**: `--test-only` flag for early testing without setting env vars
- **Comprehensive Testing**: Multiple test stages (CLI, API, distributed execution)
- **Clear Output**: Structured test results for GitHub Actions to parse
- **Better Error Handling**: Specific quota and connection error detection

#### Test Stages:

1. **CLI Availability** - Basic nx-cloud command availability
2. **API Connectivity** - Authentication and workspace status
3. **Distributed Execution** - Capability to start distributed runs

### 5. Benefits

#### Performance Optimization:

- **Faster Fallback**: Immediate local execution when cloud unavailable
- **Resource Efficiency**: No wasted time on failed cloud connections
- **Parallel Optimization**: Appropriate parallelism for execution mode

#### Developer Experience:

- **Transparent Operation**: Clear logging of execution mode selection
- **Predictable Behavior**: Consistent fallback when quota exceeded
- **Reduced CI Failures**: No builds failing due to cloud unavailability

#### Cost Management:

- **Quota Awareness**: Respects Nx Cloud usage limits
- **Automatic Fallback**: Continues builds when quota exceeded
- **Efficient Usage**: Uses cloud when available, local when not

## Usage in CI

### Pull Request Validation:

- Tests cloud availability early in workflow
- Uses 8 agents when cloud available
- Falls back to local execution (NX_PARALLEL=2) when cloud unavailable
- All tasks run on affected projects only

### Integration Builds:

- Similar cloud testing approach
- Uses 6 agents when cloud available (slightly fewer for stability)
- Falls back to local execution (NX_PARALLEL=3) with higher parallelism
- All tasks run on entire workspace

### Other Workflows:

- Lambda deployment and package validation workflows unaffected
- Only workflows using Nx tasks need cloud testing
- Individual workflows can customize agent counts and parallelism

## Migration Notes

### What Changed:

1. **Environment Variables**: Moved from global workflow env to conditional step-based setting
2. **Setup Action**: Simplified to remove duplicate cloud logic
3. **Testing Strategy**: Added early cloud testing with structured results
4. **Fallback Logic**: Enhanced with better error detection and handling

### What Stayed the Same:

- **Nx Task Execution**: Same nx-tasks action with same parameters
- **Caching Strategy**: Unchanged dependency and Nx caching
- **Security**: Same secrets and permissions model
- **Performance**: Similar or better performance in both modes

## Troubleshooting

### Common Scenarios:

#### Quota Exceeded:

- Workflow automatically detects and configures local execution
- Builds continue successfully with conservative parallelism
- Clear logging indicates quota status

#### Cloud Service Issues:

- API connectivity tests catch service problems early
- Immediate fallback to local execution
- No hanging or timeout issues

#### Mixed Results:

- If cloud test passes but start-ci-run fails, emergency fallback activates
- Workflow continues with local execution
- Clear logging of the failure scenario

## Future Enhancements

### Possible Improvements:

1. **Quota Monitoring**: Dashboard integration for quota usage tracking
2. **Dynamic Parallelism**: Adjust based on repository size and available resources
3. **Conditional Agent Scaling**: Different agent counts based on change scope
4. **Cost Optimization**: Smart cloud usage based on time of day or priority

### Metrics to Track:

- Cloud availability percentage
- Build time differences (cloud vs local)
- Quota consumption patterns
- Fallback frequency and reasons
