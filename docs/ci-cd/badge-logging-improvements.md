# Badge Action Logging Improvements

## Overview

Reduced verbose logging in the `update-badges` action to respect the `NX_VERBOSE_LOGGING` environment variable that's controlled by the `ci-debug` label or `debug_mode` workflow input.

## What Changed

### Before

The badge update action always displayed:

- Full step results JSON
- Detailed file listings (`ls -la *.json`)
- Full gist payload size
- Complete gist API responses
- Detailed badge URLs generation with full step summary
- Individual badge file listings in step summary

This created significant noise in CI logs, making it harder to spot actual issues.

### After

The badge update action now:

- **Checks `NX_VERBOSE_LOGGING` environment variable** at the workflow level
- **Uses condensed output by default**:
  - Shows badge count instead of file listing
  - Omits detailed step results parsing
  - Skips gist payload size details
  - Hides successful API response details
  - Shows minimal step summary
- **Shows full details only when verbose logging is enabled**

## Implementation Details

### 1. Verbose Logging Check

```bash
# Check verbose logging setting
VERBOSE="${NX_VERBOSE_LOGGING:-false}"

# Logging helper function
log_verbose() {
  if [ "$VERBOSE" = "true" ]; then
    echo "$@"
  fi
}
```

### 2. Conditional Output

**Verbose Output (when `NX_VERBOSE_LOGGING=true`):**

- Full step results JSON parsing details
- Complete file listings with permissions and sizes
- Gist payload size in bytes
- Full API responses on errors
- Detailed step summary with all badge files
- Badge URL generation section

**Condensed Output (default):**

- Simple badge count: "Generated 12 badge files"
- Success/failure status only
- Minimal step summary: "Updated 12 badges for main"
- No badge URL generation section

### 3. Step Summary Changes

**Before (always shown):**

```
## 🎖️ CI Status Badges Updated

- **Gist ID**: c0b25f4a406c1216b17211cc13a9c1af
- **Badges Updated**: 12
- **Workflow**: 123456789
- **Branch**: main
- **Status**: success

Badge files updated:
- `CI-Pipeline.json`
- `DTE-Detection.json`
- `Nx-DTE-Status.json`
...
```

**After (condensed mode):**

```
## 🎖️ Badges Updated
Updated 12 badges for main
```

## How to Enable Verbose Logging

There are two ways to enable verbose logging:

### 1. Add `ci-debug` Label to PR

Add the `ci-debug` label to any pull request to enable verbose logging for that PR's CI runs.

### 2. Use Workflow Dispatch with Debug Mode

When manually triggering the workflow:

1. Go to Actions → CI Pipeline
2. Click "Run workflow"
3. Check the "Enable debug mode" checkbox
4. Click "Run workflow"

## Benefits

✅ **Cleaner CI logs**: Easier to scan for important information  
✅ **Faster log review**: Less scrolling through badge update details  
✅ **Consistent with other actions**: Follows the same pattern as other CI actions  
✅ **On-demand verbosity**: Can still get full details when debugging  
✅ **Reduced log size**: Smaller logs mean faster loading and less storage

## Example Log Comparison

### Default Mode (Condensed)

```
🎖️ Updating CI Status Badges
Generated 12 badge files
✅ Successfully updated gist badges

## 🎖️ Badges Updated
Updated 12 badges for main
```

### Debug Mode (Verbose)

```
🎖️ Updating CI Status Badges
Generating badge files for CI steps...
Parsing step results: {"DTE Detection":"success","Change Detection":"success",...}
Using jq for JSON parsing
  ✓ Created badge for 'DTE Detection' - passing
  ✓ Created badge for 'Change Detection' - passing
  ...
Generated badge files:
total 96
-rw-r--r-- 1 runner docker 145 Oct 14 12:00 CI-Pipeline.json
-rw-r--r-- 1 runner docker 147 Oct 14 12:00 DTE-Detection.json
...
Updating gist c0b25f4a406c1216b17211cc13a9c1af...
Gist payload size: 2847 bytes
✅ Successfully updated gist badges

## 🎖️ CI Status Badges Updated
- **Gist ID**: c0b25f4a406c1216b17211cc13a9c1af
- **Badges Updated**: 12
...

## Badge URLs
[![CI Pipeline](https://img.shields.io/endpoint?url=...)](...)
...
```

## Related Documentation

- [CI Badges Setup Guide](./CI_BADGES_SETUP.md) - Initial setup instructions
- [Nx DTE Badge Implementation](./nx-dte-badge-implementation.md) - DTE status badge details
- [CI System Documentation](./ci-system-documentation.md) - Complete CI architecture

## Testing

To verify the logging improvements:

1. **Test Default (Condensed) Mode:**
   - Push a change to `main` branch
   - Check CI logs - badge updates should be minimal

2. **Test Verbose Mode:**
   - Create a PR with `ci-debug` label
   - Check CI logs - badge updates should show full details

3. **Test Manual Dispatch:**
   - Run workflow manually with debug mode enabled
   - Verify full badge update details are shown
