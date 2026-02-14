# Sentry Sourcemap Upload Configuration

## Overview

This document describes the automatic sourcemap upload configuration for all deployed resources in the Legacy Sports application. Sourcemaps are automatically uploaded to Sentry during production builds to enable better error debugging and stack trace resolution.

## Supported Resources

### 1. Web Application

**Location**: `apps/web`  
**Build Tool**: Vite  
**Sentry Project**: `web`

The web application automatically uploads sourcemaps when built with the `deploy` configuration:

```bash
pnpm exec nx build web --configuration=deploy
```

**Configuration**: See `apps/web/vite.config.mts`

### 2. Lambda Functions

All Lambda functions automatically upload sourcemaps during production builds:

| Lambda          | Directory                 | Sentry Project           |
| --------------- | ------------------------- | ------------------------ |
| GraphQL         | `lambdas/db`              | `lambda-graphql`         |
| Stats           | `lambdas/stats-lambda`    | `lambda-stats`           |
| OAuth Proxy     | `lambdas/oauth-proxy`     | `lambda-oauth-proxy`     |
| Game Selection  | `lambdas/game-selection`  | `lambda-game-selection`  |
| Draft Processor | `lambdas/draft-processor` | `lambda-draft-processor` |

**Build Tool**: Vite  
**Configuration**: Each lambda has its own `vite.config.mts` with Sentry plugin configured

## How It Works

### Build-Time Upload

Sourcemaps are uploaded automatically during production builds using the `@sentry/vite-plugin`:

1. **Sourcemap Generation**: Vite generates sourcemaps with `sourcemap: 'hidden'` option
   - Sourcemaps are created but not referenced in the deployed JavaScript
   - This prevents sourcemap files from being publicly accessible

2. **Automatic Upload**: The Sentry Vite plugin uploads sourcemaps to Sentry
   - Only runs when `NODE_ENV=production` and `SENTRY_AUTH_TOKEN` is set
   - Automatically associates sourcemaps with the correct release version
   - Cleans up sourcemap files after upload (they're not deployed)

3. **Release Tracking**: Each deployment is tracked as a Sentry release
   - Format: `{project}@{version}-{commit-sha}`
   - Example: `web@1.2.3-abc123def`
   - Enables tracking which code version is deployed

### Release Names

Release names follow this format:

- **Web**: `web@{APP_VERSION}-{COMMIT_SHA}`
- **Lambdas**: `{lambda-name}@{APP_VERSION}-{COMMIT_SHA}`

Examples:

- `web@main-1234-abc123d`
- `stats-lambda@1.0.5-def456g`

## Required Environment Variables

### For CI/CD Deployments

Add these secrets to your GitHub repository:

```yaml
SENTRY_AUTH_TOKEN: <your-sentry-auth-token>
SENTRY_ORG: legacy-sports # Your Sentry organization name
```

### For Local Development

Sourcemap upload is **disabled** for local development builds. To test locally:

```bash
# Set environment variables
export NODE_ENV=production
export SENTRY_AUTH_TOKEN=<your-token>
export SENTRY_ORG=legacy-sports
export APP_VERSION=local-test

# Build with production configuration
pnpm exec nx build web --configuration=deploy
```

## GitHub Actions Integration

### Web Deployment

File: `.github/workflows/deploy-web.yml`

```yaml
- name: Build Web App
  env:
    NODE_ENV: production
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: web
    VITE_APP_VERSION: ${{ github.ref_name }}-${{ github.run_number }}
    VITE_COMMIT_SHA: ${{ github.sha }}
  run: |
    pnpm exec nx build web --configuration=deploy
```

### Lambda Deployments

All lambda deployment workflows use the `build-lambda` action which automatically passes Sentry configuration:

File: `.github/actions/build-lambda/action.yml`

```yaml
inputs:
  sentry-auth-token:
    description: 'Sentry authentication token for sourcemap upload'
    required: false
  sentry-org:
    description: 'Sentry organization name'
    required: false
  sentry-project:
    description: 'Sentry project name'
    required: false
```

## Troubleshooting

### Sourcemaps Not Uploading

1. **Check Environment Variables**

   ```bash
   echo $SENTRY_AUTH_TOKEN
   echo $NODE_ENV
   ```

   Both must be set for upload to occur.

2. **Check Build Logs**
   Look for Sentry plugin output:

   ```
   [sentry-vite-plugin] Successfully uploaded sourcemaps to Sentry
   ```

3. **Verify Sentry Project Exists**
   - Log into Sentry
   - Check that the project exists (e.g., `web`, `lambda-graphql`)
   - Verify your auth token has write permissions

### Invalid Release Version

If you see errors about invalid release names:

1. Check that `APP_VERSION` or `VITE_APP_VERSION` is set
2. Verify git SHA is available (`GITHUB_SHA` or `VITE_COMMIT_SHA`)
3. Release names must match pattern: `project@version`

### Sourcemap Files Still in Deployment

If sourcemap files (`.map`) are present in the deployed bundle:

1. Check that `filesToDeleteAfterUpload` is configured
2. Verify the Sentry plugin is running (check build logs)
3. Ensure build doesn't fail before cleanup runs

## Sentry Configuration

### Creating Sentry Auth Token

1. Go to Sentry Settings → Auth Tokens
2. Create a new token with `project:releases` and `project:write` scopes
3. Add the token to your GitHub repository secrets as `SENTRY_AUTH_TOKEN`

### Sentry Project Setup

Each deployed resource should have its own Sentry project:

- Web: `web`
- Lambda GraphQL: `lambda-graphql`
- Lambda Stats: `lambda-stats`
- Lambda OAuth: `lambda-oauth-proxy`
- Lambda Game Selection: `lambda-game-selection`
- Lambda Draft Processor: `lambda-draft-processor`

## Benefits

1. **Better Error Debugging**: Original source code locations in error stack traces
2. **Release Tracking**: See which code version caused errors
3. **Commit Tracking**: Automatically link errors to specific commits
4. **Security**: Sourcemaps not exposed publicly (hidden mode)
5. **Automatic**: No manual upload steps required

## Performance Impact

- **Build Time**: Adds ~5-10 seconds to production builds
- **Bundle Size**: No impact (sourcemaps not included in bundle)
- **Runtime**: No impact (sourcemaps processed by Sentry backend)

## Future Enhancements

1. **React Native**: Add sourcemap upload for Android/iOS builds
2. **Webpack Migration**: If migrating from Vite, use `@sentry/webpack-plugin`
3. **Multi-Environment**: Support dev/staging/prod with different Sentry projects
4. **Source Context**: Enable attaching source code context to error reports

## Related Documentation

- [Sentry JavaScript Sourcemaps](https://docs.sentry.io/platforms/javascript/sourcemaps/)
- [Vite Plugin Configuration](https://github.com/getsentry/sentry-javascript-bundler-plugins/tree/main/packages/vite-plugin)
- [Lambda Build Process](../build-and-tooling/lambda-builds.md)
- [Web Deployment](./web-deployment.md)

## Questions or Issues?

If you encounter issues with sourcemap uploads:

1. Check this documentation first
2. Review build logs for error messages
3. Verify Sentry project configuration
4. Consult the [Sentry Vite Plugin docs](https://github.com/getsentry/sentry-javascript-bundler-plugins)
