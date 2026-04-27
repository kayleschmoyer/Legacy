> **Archived 2026-04-27.** This document describes a system that has been replaced. See [ci-greenfield-design.md](../ci-greenfield-design.md) for the current architecture.

---

# Merge Queue Permissions Fix

## Issue: "Resource not accessible by integration"

This error occurs when the merge queue workflow doesn't have sufficient permissions to merge pull requests.

## Root Cause

The default `GITHUB_TOKEN` used by GitHub Actions may not have write permissions to merge PRs, depending on your repository settings.

## Solution: Update Repository Settings

### Step 1: Navigate to Workflow Permissions

1. Go to your GitHub repository: https://github.com/bkrupa/legacy-sports
2. Click the **Settings** tab
3. In the left sidebar, click **Actions** → **General**
4. Scroll down to the **Workflow permissions** section

### Step 2: Update Permissions

Select the following options:

- ✅ **"Read and write permissions"**
  - This allows workflows to write to the repository (merge PRs, create commits, etc.)
- ✅ **"Allow GitHub Actions to create and approve pull requests"**
  - This specifically allows workflows to merge and approve PRs

### Step 3: Save Changes

Click the **Save** button at the bottom of the page.

### Step 4: Test the Merge Queue

1. Add the `merge-when-ready` label to a PR with passing CI
2. Wait for the next merge queue cycle (runs every 10 minutes)
3. The PR should now merge successfully

---

## Alternative Solution: Use Personal Access Token (Advanced)

If you need more control or the above solution doesn't work, you can use a Personal Access Token (PAT) or GitHub App:

### Option A: Personal Access Token

1. Create a PAT with `repo` scope
2. Add it as a repository secret (e.g., `MERGE_QUEUE_PAT`)
3. Update `.github/workflows/merge-queue.yml`:

```yaml
steps:
  - uses: actions/checkout@v5
    with:
      token: ${{ secrets.MERGE_QUEUE_PAT }} # Instead of GITHUB_TOKEN
```

### Option B: GitHub App (Most Secure)

1. Create a GitHub App with PR merge permissions
2. Install it on your repository
3. Use `actions/create-github-app-token` to generate tokens

---

## Verification

After applying the fix, you should see:

✅ Merge queue successfully merges PRs  
✅ No "Resource not accessible by integration" errors  
✅ Success comments posted on merged PRs

## Troubleshooting

### Still Getting Errors?

1. **Check Branch Protection Rules**
   - Go to Settings → Branches → Branch protection rules
   - Ensure the protection rules don't prevent Actions from merging

2. **Verify Required Status Checks**
   - Make sure all required checks are passing
   - The merge queue won't merge if checks fail

3. **Check Repository Visibility**
   - Private repos may have different permission requirements
   - Ensure the workflow has appropriate access

4. **Review Workflow Logs**
   - Go to Actions → Merge Queue workflow
   - Check the logs for detailed error messages

### Need Help?

If the issue persists after updating permissions:

1. Check the workflow logs for detailed error messages
2. Verify that your GitHub account has admin access to the repository
3. Try manually merging a PR to confirm you have merge permissions
4. Contact GitHub Support if it appears to be a platform issue

---

## Related Files

- `.github/workflows/merge-queue.yml` - Main merge queue workflow
- `.github/workflows/merge-queue-management.yml` - Label management
- `docs/merge-queue-guide.md` - User guide for using the merge queue

## Updated: October 13, 2025

The workflow has been updated to include better error handling and will provide specific guidance when permission errors occur.