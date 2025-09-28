# Nx Cloud Fallback System

## Overview

This system provides automatic fallback to local execution when Nx Cloud is unavailable or has exceeded usage limits. This ensures CI builds continue to work even when the free tier quota is exhausted.

## How It Works

### 1. Automatic Detection

- The `.github/scripts/nx-cloud-fallback.sh` script tests Nx Cloud connectivity
- Runs automatically during the setup phase of all CI workflows
- Sets appropriate environment variables based on availability

### 2. Execution Modes

#### Nx Cloud Mode (Preferred)

- **When**: Nx Cloud is available and has quota remaining
- **Features**: Distributed execution across multiple agents
- **Performance**: Fastest builds due to parallelization
- **Settings**:
  - `NX_CLOUD_DISTRIBUTED_EXECUTION=true`
  - `NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT=6-8`
  - `NX_PARALLEL=4-8`

#### Local Fallback Mode (Automatic)

- **When**: Nx Cloud is unavailable, over quota, or API errors occur
- **Features**: Local execution with conservative parallelism
- **Performance**: Slower but reliable
- **Settings**:
  - `NX_CLOUD_DISTRIBUTED_EXECUTION=false`
  - `NX_LOCAL_FALLBACK=true`
  - `NX_PARALLEL=2`

### 3. Fallback Triggers

The system automatically falls back to local execution when:

- NX_CLOUD_ACCESS_TOKEN is missing or invalid
- Nx Cloud API is unresponsive (timeout after 30 seconds)
- Nx Cloud CLI commands fail
- Distributed execution startup fails
- Usage quota is exceeded

## Implementation Details

### Modified Files

#### `.github/scripts/nx-cloud-fallback.sh`

- Core detection script that tests Nx Cloud availability
- Sets environment variables for execution mode
- Provides clear logging about decisions

#### `.github/actions/setup/action.yml`

- Runs fallback detection automatically
- Configures environment based on availability
- Handles Nx Cloud startup with error recovery

#### `.github/actions/nx-tasks/action.yml`

- Respects fallback environment variables
- Adjusts parallelism and execution strategy
- Provides clear logging about execution mode
- Includes last-resort fallback for runtime errors

#### Workflow Files

- `integration-build.yml`: Updated for fallback awareness
- `pr-validation.yml`: Updated for fallback awareness
- Both workflows now show execution mode clearly

### Environment Variables

| Variable                                     | Nx Cloud Mode | Fallback Mode | Description                    |
| -------------------------------------------- | ------------- | ------------- | ------------------------------ |
| `NX_CLOUD_DISTRIBUTED_EXECUTION`             | `true`        | `false`       | Enables distributed execution  |
| `NX_LOCAL_FALLBACK`                          | `false`       | `true`        | Indicates fallback mode active |
| `NX_PARALLEL`                                | `4-8`         | `2`           | Number of parallel processes   |
| `NX_CLOUD_DISTRIBUTED_EXECUTION_AGENT_COUNT` | `6-8`         | `0`           | Number of Nx Cloud agents      |

## Usage

### For CI (Automatic)

The system works automatically in all workflows. No manual intervention required.

### For Local Development

```bash
# Test fallback detection
./.github/scripts/nx-cloud-fallback.sh

# Test with no token (should fallback)
unset NX_CLOUD_ACCESS_TOKEN
./.github/scripts/nx-cloud-fallback.sh

# Test with real token (uses Nx Cloud if available)
export NX_CLOUD_ACCESS_TOKEN='your-token'
./.github/scripts/nx-cloud-fallback.sh
```

### For Testing

```bash
# Run comprehensive fallback tests
./.github/scripts/test-nx-fallback.sh
```

## Benefits

1. **Reliability**: Builds continue even when Nx Cloud is unavailable
2. **Transparency**: Clear indication of execution mode in logs
3. **Cost Awareness**: Automatic handling of quota limits
4. **Performance**: Still uses Nx Cloud when available for optimal performance
5. **Maintenance**: No manual intervention required when quotas reset

## Monitoring

Watch for these indicators in CI logs:

### Nx Cloud Mode

```
🚀 Running in NX CLOUD DISTRIBUTED MODE
✅ Distributed CI run started with 6 agents
```

### Fallback Mode

```
🔧 Running in LOCAL FALLBACK MODE (Nx Cloud unavailable)
⚠️ Nx Cloud unavailable - configuring local execution
```

## Troubleshooting

### If Builds Are Consistently Using Fallback

1. Check if Nx Cloud quota has been exceeded
2. Verify `NX_CLOUD_ACCESS_TOKEN` secret is set correctly
3. Check Nx Cloud service status
4. Review quota usage in Nx Cloud dashboard

### If Builds Are Too Slow in Fallback Mode

This is expected behavior. Fallback mode uses conservative settings for reliability:

- Parallelism reduced from 6-8 to 2
- No distributed execution
- Full local processing

### To Force Local Mode (For Testing)

```bash
export NX_CLOUD_ACCESS_TOKEN=""
# Run your build commands
```

## Future Enhancements

Possible improvements to consider:

1. Quota monitoring and alerts
2. Automatic quota reset detection
3. Hybrid mode (partial distributed execution)
4. Build time comparison reporting
5. Automatic optimization of local parallelism based on runner capacity
