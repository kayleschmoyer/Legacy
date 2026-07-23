# CI Badges Setup Guide

This guide covers the status badge system for the Legacy Sports project: deployment and health badges served from a GitHub Gist via [shields.io endpoint badges](https://shields.io/badges/endpoint-badge).

> **History**: the CI pipeline previously wrote per-stage badges (Lint, Format, Test, etc.) via a `.github/actions/update-badges` action. That machinery was removed (LS-8619) — the CI pipeline is `workflow_call`-only and never runs on `refs/heads/main`, so those badges could never update. Remaining badges are deployment badges (written by `.github/actions/update-deployment-badge`) and lambda health badges (written by `.github/actions/update-health-badge`).

## 📋 Prerequisites

1. **GitHub Account**: You need to be the repository owner or have admin access
2. **GitHub Token**: A personal access token with `gist` scope
3. **Gist ID**: A gist to store the badge JSON files

## 🔧 Setup Steps

### Step 1: Create a GitHub Gist

1. Go to https://gist.github.com
2. Create a new **public** gist
3. Add a file named `setup.md` with content:

   ```markdown
   # Legacy Sports CI Badges

   This gist stores the badge JSON files for the Legacy Sports CI pipeline.
   Updated automatically by GitHub Actions.
   ```

4. Create the gist and copy the **Gist ID** from the URL (e.g., `c0b25f4a406c1216b17211cc13a9c1af`)

### Step 2: Add Repository Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- **`CI_BADGES_GIST_ID`** — the gist ID from Step 1
- **`GIST_TOKEN`** — a personal access token with `gist` scope (the default `GITHUB_TOKEN` cannot write gists)

### Step 3: Badge Files

Badge JSON files are created automatically in the gist on the first run of each writing workflow:

| Writer action                             | Workflows                                                           | Gist files                                               |
| ----------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `.github/actions/update-deployment-badge` | `deploy.yml`, `build-android-app.yml`, `lambda-terraform-apply.yml` | `<Deployment-Name>.json` (e.g. `Build-Android-APK.json`) |
| `.github/actions/update-health-badge`     | `lambda-health-checks.yml`, `lambda-terraform-apply.yml`            | `Health-<Lambda-Name>.json`                              |

### Step 4: Reference Badges in the README

```markdown
[![Build Android APK](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/YOUR_GIST_ID/raw/Build-Android-APK.json)](https://github.com/bkrupa/legacy-sports/actions/workflows/build-android-app.yml)
```

## 🎯 Badge Behavior

- **Status Colors**:
  - 🟢 `brightgreen` - Success/Passing
  - 🔴 `red` - Failure/Failing
  - 🟡 `yellow` - Cancelled
  - ⚪ `lightgrey` - Skipped
  - 🔵 `blue` - Info (timestamps, branch names)
- **Cache**: Badges cache for 5 minutes (300 seconds)

## 🔧 Troubleshooting

- **Badges not updating**: Check that `CI_BADGES_GIST_ID` and `GIST_TOKEN` secrets are set correctly
- **Permission errors**: Ensure the gist is public and `GIST_TOKEN` has `gist` scope
- **Badge shows "invalid"**: The gist file doesn't exist yet — run the writing workflow once, or verify the filename in the README URL matches the gist file exactly
