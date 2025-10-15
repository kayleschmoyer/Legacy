# Nx Cloud Quota Handling Fix

## Problem

The CI pipeline was failing with the following error:

```
NX   Connection to Nx Cloud failed with status code 401

This Nx Cloud organization has been disabled due to exceeding the FREE plan.
```

The build validation step was attempting to use Nx Cloud's Distributed Task Execution (DTE) feature, but the organization had exceeded its FREE plan limits. When DTE failed, the entire build failed without fallback.

## Root Cause

1. **Insufficient Quota Detection**: The `detect-dte` action only checked if the Nx Cloud CLI was installed and could run help commands, but didn't actually test the connection or check for quota/authentication issues.

2. **No Fallback Logic**: When Nx Cloud failed at runtime (after DTE was already detected as "available"), the build would fail immediately without attempting to retry with local execution.

3. **Silent Failures**: The system would report DTE as available, but then fail during actual build execution when quota limits were enforced.

## Solution

### 1. Improved DTE Detection (`.github/actions/detect-dte/action.yml`)

Changed the detection logic to:
- Use `npx nx-cloud status` instead of `--help` to verify actual connectivity
- Check for specific error patterns:
  - `401` errors (authentication failures)
  - `disabled due to exceeding` (quota exceeded)
  - `exceeded.*plan` (plan limits)
- Add warning messages with links to upgrade when quota is exceeded
- Properly set `FALLBACK_REASON` for quota issues

**Before:**
```bash
CLI_TEST=$(timeout 15s npx nx-cloud start-ci-run --help 2>&1 || echo "FAILED")
```

**After:**
```bash
CLI_TEST=$(timeout 15s npx nx-cloud status 2>&1 || echo "COMMAND_FAILED")
# Check for quota exceeded errors
if echo "$CLI_TEST" | grep -qi "disabled due to exceeding\|exceeded.*plan\|quota exceeded"; then
  FALLBACK_REASON="Nx Cloud quota exceeded - FREE plan limit reached"
  echo "::warning::Nx Cloud FREE plan quota exceeded. Visit https://cloud.nx.app to upgrade..."
fi
```

### 2. Runtime Fallback Logic (`.github/actions/build-validation/action.yml`)

Added fallback logic for both web and lambda builds:
- Attempt build with DTE first (if configured)
- If build fails, check logs for Nx Cloud errors
- If Nx Cloud errors detected, automatically retry with local execution
- If local execution also fails, or if it's not a Nx Cloud error, fail immediately

**Build Flow:**
```
1. Try build with DTE (if enabled)
   ↓
2. Build fails? → Check logs for Nx Cloud errors
   ↓
3. Nx Cloud error? → Retry with local build
   ↓
4. Success? → Continue
   ↓
5. Still failing? → Exit with error
```

**Error Detection Pattern:**
```bash
if grep -qi "401.*Nx Cloud\|Unable to connect to Nx Cloud\|disabled due to exceeding\|exceeded.*plan" "${ERROR_CONTEXT}.log"; then
  echo "⚠️ Nx Cloud DTE failed - falling back to local build"
  # Retry with local execution...
fi
```

### 3. Benefits

1. **Resilient CI**: Builds continue even when Nx Cloud is unavailable or over quota
2. **Clear Warnings**: Users see explicit warnings about quota issues with upgrade links
3. **Automatic Recovery**: No manual intervention needed - system automatically falls back
4. **Cost Visibility**: Users are informed about Nx Cloud usage and limits
5. **Faster Feedback**: Upfront detection reduces wasted build time

## Testing

To test this fix:

1. **Simulate Quota Exceeded**:
   - Wait for actual quota exceeded (current state)
   - Or temporarily use invalid Nx Cloud token

2. **Verify Detection**:
   - Check "Detect DTE" step output
   - Should show warning about quota
   - Should set `execution-mode: local`

3. **Verify Fallback**:
   - If detection misses quota issue
   - Build should retry automatically
   - Should succeed with local execution

## Immediate Actions Required

### Option 1: Upgrade Nx Cloud (Recommended for Speed)
- Visit: https://cloud.nx.app/orgs/68ce3a7cba8a6064f2ab05da/plans
- Start a free 2-week PRO trial (no billing required)
- This restores DTE and significantly speeds up CI (~60-80% faster)

### Option 2: Use Local Execution (Current Fallback)
- The CI will now automatically use local execution
- Builds will be slower but functional
- Wait for monthly quota reset on Nx Cloud FREE plan

### Option 3: Disable DTE Entirely
If you want to skip DTE detection completely:
```yaml
# In .github/workflows/ci-pipeline.yml
env:
  NX_CLOUD_ACCESS_TOKEN: ""  # Remove or comment out
```

## Related Files

- `.github/actions/detect-dte/action.yml` - DTE detection logic
- `.github/actions/build-validation/action.yml` - Build execution with fallback
- `.github/workflows/ci-pipeline.yml` - Main CI workflow

## Future Improvements

1. **Quota Monitoring**: Add periodic quota checks and alerts
2. **Usage Analytics**: Track Nx Cloud usage patterns
3. **Smart Scheduling**: Spread builds to avoid hitting quota
4. **Cost Management**: Consider upgrading for busy periods only
