# CI Badges Setup Guide

This guide will help you set up the CI badges system for the Legacy Sports project.

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
   Updated automatically by GitHub Actions on main branch builds.
   ```

4. Create the gist and copy the **Gist ID** from the URL (e.g., `c0b25f4a406c1216b17211cc13a9c1af`)

### Step 2: Add Repository Secrets

Add these secrets to your GitHub repository:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add the following repository secrets:
   - **Name**: `CI_BADGES_GIST_ID`  
     **Value**: Your gist ID from Step 1

   > Note: `GITHUB_TOKEN` is automatically available and doesn't need to be added

### Step 3: Initialize Badge Files (Optional)

You can manually create initial badge files in your gist, or let the workflow create them automatically on the first run.

To create them manually:

1. Edit your gist
2. Add these files with the initial content:

#### `CI Pipeline.json`

```json
{
  "schemaVersion": 1,
  "label": "CI Pipeline",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `DTE Detection.json`

```json
{
  "schemaVersion": 1,
  "label": "DTE Detection",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Change Detection.json`

```json
{
  "schemaVersion": 1,
  "label": "Change Detection",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Execution Plan.json`

```json
{
  "schemaVersion": 1,
  "label": "Execution Plan",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Quality Gates.json`

```json
{
  "schemaVersion": 1,
  "label": "Quality Gates",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Build Validation.json`

```json
{
  "schemaVersion": 1,
  "label": "Build Validation",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `E2E Testing.json`

```json
{
  "schemaVersion": 1,
  "label": "E2E Testing",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Deployment Gate.json`

```json
{
  "schemaVersion": 1,
  "label": "Deployment Gate",
  "message": "pending",
  "color": "yellow",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Branch.json`

```json
{
  "schemaVersion": 1,
  "label": "Branch",
  "message": "main",
  "color": "brightgreen",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Nx DTE Status.json`

```json
{
  "schemaVersion": 1,
  "label": "Nx DTE Status",
  "message": "disabled",
  "color": "orange",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

#### `Last Updated.json`

```json
{
  "schemaVersion": 1,
  "label": "Last Updated",
  "message": "never",
  "color": "lightgrey",
  "namedLogo": "github",
  "logoColor": "white",
  "style": "flat",
  "cacheSeconds": 300
}
```

### Step 4: Update README

Replace `YOUR_GIST_ID` in the README.md with your actual gist ID:

```markdown
[![CI Pipeline](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/bkrupa/c0b25f4a406c1216b17211cc13a9c1af/raw/CI%20Pipeline.json)](https://github.com/bkrupa/legacy-sports/actions)
```

### Step 5: Test the Setup

1. Push a commit to the `main` branch
2. Wait for the integration build to complete
3. Check your gist - it should be updated with the latest badge statuses
4. Check your README - the badges should show current status

## 🎯 Badge Behavior

- **Updates**: Badges are updated only on `main` branch integration builds
- **Status Colors**:
  - 🟢 `brightgreen` - Success/Passing
  - 🔴 `red` - Failure/Failing
  - 🟡 `yellow` - Cancelled
  - ⚪ `lightgrey` - Skipped
  - 🔵 `blue` - Info (timestamps, branch names)
- **Cache**: Badges cache for 5 minutes (300 seconds)

## 🔧 Maintenance

### Updating Badge Structure

If you add new CI steps:

1. Update the badge generation logic in `.github/actions/update-badges/action.yml`
2. Add the new badge URLs to README.md
3. The gist will automatically create the new badge files on the next run

### Troubleshooting

- **Badges not updating**: Check that `CI_BADGES_GIST_ID` secret is set correctly
- **Permission errors**: Ensure the gist is public and the GitHub token has gist scope
- **Wrong status**: Check the step IDs match between the workflow and badge generation

## 📊 Result

Once set up, you'll have:

- ✅ Real-time CI status badges in your README
- 🔄 Automatic updates on every main branch build
- 🎯 Individual badges for each CI step
- 📈 Professional project presentation

Your badges will show the current status of each CI component, giving visitors immediate insight into your project's health and quality!
