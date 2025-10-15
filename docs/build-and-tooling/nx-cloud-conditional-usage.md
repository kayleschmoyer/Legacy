# Nx Cloud Conditional Usage Pattern

## Overview

Our CI/CD system uses Nx Cloud for distributed task execution (DTE) when available, but gracefully falls back to local execution when the quota is exceeded or cloud is unavailable.

## Pattern: Conditional Nx Cloud Token

### ✅ Correct Pattern

**In workflows:**
```yaml
# Set token conditionally based on DTE detection
env:
  NX_CLOUD_ACCESS_TOKEN: ${{ steps.detect-dte.outputs.dte-available == 'true' && secrets.NX_CLOUD_ACCESS_TOKEN || '' }}
```

**In actions (when DTE unavailable):**
```bash
# Unset token to disable Nx Cloud completely
unset NX_CLOUD_ACCESS_TOKEN
export NX_CLOUD_NO_TIMEOUTS=true
```

### ❌ Anti-Pattern

```yaml
# DON'T: Always set token globally
env:
  NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}
```

This causes failures when quota is exceeded because Nx will always try to connect.

## Implementation Status

### ✅ Workflows with Conditional Nx Cloud

1. **deploy-web.yml**
   - Removed global token from env
   - Build step sets token conditionally:
     ```yaml
     env:
       NX_CLOUD_ACCESS_TOKEN: ${{ steps.detect-dte.outputs.dte-available == 'true' && secrets.NX_CLOUD_ACCESS_TOKEN || '' }}
     ```
   - Uses DTE when available, falls back to local when not

2. **ci-pipeline.yml**
   - Has global token in env (for detect-dte to check)
   - Individual actions unset it when DTE unavailable
   - Quality gates, build validation, e2e-testing all handle fallback

### ✅ Actions with Nx Cloud Fallback

1. **quality-gates/action.yml**
   ```yaml
   # Local execution path
   unset NX_CLOUD_ACCESS_TOKEN
   export NX_CLOUD_NO_TIMEOUTS=true
   ```

2. **build-validation/action.yml**
   ```yaml
   # Both web and lambda builds
   if [ "${{ inputs.execution-mode }}" != "distributed" ]; then
     unset NX_CLOUD_ACCESS_TOKEN
     export NX_CLOUD_NO_TIMEOUTS=true
   fi
   ```

3. **e2e-testing/action.yml**
   ```yaml
   # Always local for E2E reliability
   unset NX_CLOUD_ACCESS_TOKEN
   export NX_CLOUD_DISTRIBUTED_EXECUTION=false
   export NX_CLOUD_NO_TIMEOUTS=true
   ```

4. **build-lambda/action.yml**
   ```yaml
   # Lambda builds always local (fast, no DTE benefit)
   unset NX_CLOUD_ACCESS_TOKEN
   export NX_CLOUD_NO_TIMEOUTS=true
   ```

### Detection Logic

**detect-dte/action.yml** checks:
1. Token presence
2. Cloud connectivity via `npx nx-cloud status`
3. Quota availability (detects "exceeded FREE plan" errors)
4. Authentication validity

Output: `dte-available: true|false`

## Benefits

✅ **When Nx Cloud Available:**
- Fast distributed builds via DTE
- Shared cache across CI runs
- Parallel execution across agents

✅ **When Nx Cloud Unavailable:**
- Graceful fallback to local execution
- No failures due to quota limits
- Predictable build times (no cloud dependency)

✅ **Development Experience:**
- No manual intervention needed
- Clear logging of execution mode
- Consistent behavior across environments

## Testing

### Test Nx Cloud Available
```bash
# Set token and run
export NX_CLOUD_ACCESS_TOKEN="your-token"
gh workflow run ci-pipeline.yml
```

### Test Quota Exceeded
```bash
# Trigger workflow (will auto-detect and fallback)
gh workflow run ci-pipeline.yml
# Or deploy-web
gh workflow run deploy-web.yml
```

### Verify Logs
```bash
# Check for fallback messages
gh run view <run-id> --log | grep -i "cloud\|dte\|fallback"
```

Expected output when quota exceeded:
```
❌ Nx Cloud quota exceeded - FREE plan limit reached
::warning::Nx Cloud FREE plan quota exceeded...
✓ Environment configured for local execution
🏗️ Building web application locally...
```

## Migration Guide

If you need to add Nx Cloud to a new workflow:

1. **Add DTE detection step:**
   ```yaml
   - name: "☁️ Detect DTE Availability"
     id: detect-dte
     uses: ./.github/actions/detect-dte
     with:
       nx-cloud-token: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}
   ```

2. **Set token conditionally in build steps:**
   ```yaml
   - name: Build
     env:
       NX_CLOUD_ACCESS_TOKEN: ${{ steps.detect-dte.outputs.dte-available == 'true' && secrets.NX_CLOUD_ACCESS_TOKEN || '' }}
     run: npx nx build my-app
   ```

3. **Or unset in action if not using DTE:**
   ```bash
   unset NX_CLOUD_ACCESS_TOKEN
   export NX_CLOUD_NO_TIMEOUTS=true
   npx nx build my-app
   ```

## Related Documentation

- [Nx Cloud Quota Fix](./nx-cloud-quota-fix.md) - Original issue and initial fixes
- [Nx Cloud Fallback](../.github/docs/nx-cloud-fallback.md) - Detailed fallback behavior
- [CI System Documentation](./ci-system-documentation.md) - Overall CI architecture

## Last Updated

October 15, 2025
