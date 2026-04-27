# Custom Checks

This directory contains shell scripts executed by the `custom-checks` CI job
(ci-pipeline.yml Stage 2c). All scripts run within a single job and contribute
to a single combined `custom-checks` commit status — adding a script here adds
a check within that job, not a separate required check.

**Convention (design §9.4): adding a check = adding a script here.**

## Adding a Check

1. Create a `.sh` file in this directory (e.g., `.github/checks/my-check.sh`)
2. The script must exit 0 on success and non-zero on failure
3. The `custom-checks` CI job runs all `.sh` files in this directory; if any
   script fails the entire `custom-checks` required status check fails

## Example

```bash
#!/usr/bin/env bash
set -euo pipefail

# Check that schema drift hasn't occurred
echo "Checking schema drift..."
# ... your check logic here ...
echo "Schema drift check passed"
```

## Current Checks (hardcoded in the job)

In addition to the scripts here, the `custom-checks` job always runs:

- **Migration Immutability** (`scripts/check-migration-immutability.js`) — ensures
  database migrations are not modified after being committed to main
