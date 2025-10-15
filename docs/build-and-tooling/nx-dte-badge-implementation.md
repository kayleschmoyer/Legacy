# Nx DTE Status Badge Implementation

## Overview

Added a new badge to display whether Nx Distributed Task Execution (DTE) was working on the last CI run. This provides immediate visibility into whether your builds are using distributed execution or falling back to local execution.

## What Was Changed

### 1. Badge Action (`/.github/actions/update-badges/action.yml`)

**Added new input parameter:**
- `dte-status`: Accepts `true` or `false` to indicate if DTE was available and used

**Added badge generation logic:**
```bash
# Create DTE Status badge
if [ "$DTE_STATUS" = "true" ]; then
  create_badge_json "Nx DTE Status" "success" "enabled" "brightgreen"
else
  create_badge_json "Nx DTE Status" "success" "disabled" "orange"
fi
```

### 2. CI Pipeline Workflow (`/.github/workflows/ci-pipeline.yml`)

**Updated the "Update CI Status Badges" step:**
- Added `dte-status: ${{ steps.detect-dte.outputs.dte-available }}` parameter
- This passes the actual DTE availability from the detect-dte action to the badge generator

### 3. README.md

**Added new badge to CI Status section:**
```markdown
[![Nx DTE Status](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/Nx-DTE-Status.json)](https://github.com/bkrupa/legacy-sports/actions)
```

Positioned between "DTE Detection" and "Change Detection" badges for logical flow.

### 4. Documentation (`/docs/CI_BADGES_SETUP.md`)

**Added badge template:**
- Included `Nx DTE Status.json` badge template in the setup guide
- Shows default state as "disabled" with orange color

## Badge Behavior

### Colors & Messages

| DTE Status | Badge Message | Color | Meaning |
|-----------|---------------|-------|---------|
| Available & Working | `enabled` | 🟢 Green (`brightgreen`) | DTE is active, using distributed execution |
| Not Available | `disabled` | 🟠 Orange | Fallback to local execution |

### When Badge Updates

- Updates only on `main` branch pushes
- Reflects the actual DTE availability from the `detect-dte` action output
- Cache duration: 5 minutes (300 seconds)

## How It Works

1. **DTE Detection**: The `detect-dte` action runs and checks if Nx Cloud DTE is available
   - Tests cloud connectivity
   - Checks agent availability
   - Verifies quota remaining
   - Outputs `dte-available` as `true` or `false`

2. **Badge Update**: The `update-badges` action receives the DTE status
   - Generates appropriate badge JSON file
   - Updates the GitHub Gist with the new status
   - Badge color changes based on availability

3. **Display**: The README badge automatically updates
   - Green "enabled" when DTE is working
   - Orange "disabled" when falling back to local execution

## Benefits

✅ **Immediate Visibility**: Know at a glance if DTE is working  
✅ **Troubleshooting**: Quickly identify when DTE falls back to local mode  
✅ **Performance Awareness**: Track when builds are distributed vs local  
✅ **Quota Monitoring**: Indirect indicator of quota usage (when disabled, may be quota-related)

## Testing

To verify the badge is working:

1. Push a change to the `main` branch
2. Wait for the CI pipeline to complete
3. Check the README - the "Nx DTE Status" badge should update
4. Badge should show:
   - Green "enabled" if DTE was available with sufficient quota
   - Orange "disabled" if DTE was unavailable or quota exhausted

## Relationship to Other Badges

This badge complements the existing "DTE Detection" badge:

- **DTE Detection**: Shows if the detection step itself passed or failed (step outcome)
- **Nx DTE Status**: Shows the actual result - whether DTE is enabled or disabled (functional status)

Both provide different but related information about your DTE setup.
