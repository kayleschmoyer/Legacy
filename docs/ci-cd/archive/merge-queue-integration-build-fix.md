> **Archived 2026-04-27.** This document describes a system that has been replaced. See [ci-greenfield-design.md](../ci-greenfield-design.md) for the current architecture.

---

# Fix: Merge Queue Integration Build Trigger (LS-87)

**Issue**: PRs merged via the automated merge queue don't trigger integration builds on the main branch.

**Root Cause**: GitHub's security design prevents workflows triggered by `GITHUB_TOKEN` from automatically triggering other workflows. This is an intentional feature to prevent infinite workflow loops.

## Investigation Summary

### Step 1: Checked Repository Permissions (Option 3)

Using `scripts/check-workflow-permissions.ps1`, we confirmed that repository workflow permissions are correctly configured:

- ✅ Default Workflow Permissions: **Read and Write**
- ✅ Can Approve/Create PRs: **Yes**
- ✅ GitHub Actions: **Enabled** (all actions allowed)

### Step 2: Confirmed GitHub Security Behavior

Despite correct permissions, GitHub intentionally prevents `GITHUB_TOKEN` from triggering subsequent workflows. This is documented in [GitHub's security guidelines](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow).

From GitHub's documentation:

> "When you use the repository's `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN` will not create a new workflow run."

## Solution Implemented

**Option 2: Explicit Workflow Dispatch Trigger**

Modified [`.github/workflows/merge-queue.yml`](../.github/workflows/merge-queue.yml) to explicitly trigger the CI orchestrator after successful PR merges:

```javascript
// After successful merge
await github.rest.actions.createWorkflowDispatch({
  owner,
  repo,
  workflow_id: 'ci-orchestrator.yml',
  ref: pr.base.ref,
  inputs: {
    debug_mode: 'false',
  },
});
```

### Why This Solution?

1. **No Token Management**: Doesn't require creating/managing Personal Access Tokens
2. **Explicit Control**: Clear visibility when integration builds are triggered
3. **Error Handling**: Gracefully handles trigger failures without blocking merges
4. **Maintainable**: Simple, straightforward implementation

## Alternative Solutions (Not Implemented)

### Option 1: Personal Access Token (PAT)

**Not chosen because**:

- Requires creating and securely storing a PAT
- PAT needs regular rotation for security
- Adds complexity to CI/CD pipeline
- Introduces a single point of failure if PAT expires

**How it would work**:

```yaml
steps:
  - uses: actions/checkout@v6
    with:
      token: ${{ secrets.MERGE_QUEUE_PAT }} # Instead of GITHUB_TOKEN
```

### Option 3: GitHub App Token

**Not chosen because**:

- Most complex solution
- Requires creating and installing a GitHub App
- Overkill for this use case

## Testing

To verify the fix:

1. Create a test PR
2. Add the `merge-when-ready` label
3. Wait for merge queue to process (runs every 10 minutes or on check completion)
4. After merge, verify CI orchestrator workflow runs on main branch

### Expected Behavior After Fix

1. ✅ Merge queue merges PR to main
2. ✅ Merge queue explicitly triggers CI orchestrator via workflow_dispatch
3. ✅ CI orchestrator runs full integration build on main
4. ✅ Deployment workflows trigger if configured

### Monitoring

Check merge queue logs for this message after successful merges:

```
✅ CI orchestrator triggered successfully
```

If the trigger fails, the merge will still succeed but you'll see:

```
⚠️ Failed to trigger CI orchestrator: [error message]
Integration build may need to be triggered manually
```

## Related Files

- `.github/workflows/merge-queue.yml` - Modified to trigger CI
- `.github/workflows/ci-orchestrator.yml` - Receives workflow_dispatch trigger
- `scripts/check-workflow-permissions.ps1` - Diagnostic script for permissions
- `docs/ci-cd/merge-queue-permissions-fix.md` - Original permissions documentation

## References

- [GitHub Docs: Automatic token authentication](https://docs.github.com/en/actions/security-guides/automatic-token-authentication)
- [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)
- [GitHub Community: GITHUB_TOKEN not triggering workflows](https://github.com/orgs/community/discussions/25702)

## Date Implemented

February 6, 2026

## Jira Ticket

[LS-87](https://jira-prod-us-38-as-3.prod.atl-paas.net/browse/LS-87)