# Configure Sentry Sourcemap Upload

**Purpose**: Add automatic Sentry sourcemap upload to a new build configuration

**When to use**: Adding a new Lambda, web app, or other deployed resource that needs Sentry error tracking with sourcemaps

## Prerequisites

- `@sentry/vite-plugin` installed in workspace
- Sentry project created for the resource
- `SENTRY_AUTH_TOKEN` secret configured in GitHub Actions

## Steps

### For Vite-based Projects

1. **Import Sentry Plugin**

   Add to your `vite.config.mts`:

   ```typescript
   import { sentryVitePlugin } from '@sentry/vite-plugin';
   import { execSync } from 'child_process';
   ```

2. **Add Environment Detection**

   ```typescript
   const isProduction = process.env.NODE_ENV === 'production';
   const enableSentry = isProduction && !!process.env.SENTRY_AUTH_TOKEN;

   const appVersion = process.env.APP_VERSION || '0.0.0';
   const commitSha = (() => {
     try {
       return execSync('git rev-parse --short HEAD').toString().trim();
     } catch {
       return 'dev';
     }
   })();
   ```

3. **Configure Sourcemap Generation**

   In your build options:

   ```typescript
   build: {
     sourcemap: isProduction ? 'hidden' : false,
     // ... other options
   }
   ```

4. **Add Sentry Plugin to Plugins Array**

   ```typescript
   plugins: [
     // ... other plugins
     ...(enableSentry
       ? [
           sentryVitePlugin({
             org: process.env.SENTRY_ORG || 'legacy-sports',
             project: process.env.SENTRY_PROJECT || 'your-project-name',
             authToken: process.env.SENTRY_AUTH_TOKEN,
             release: {
               name: `your-project@${appVersion}-${commitSha}`,
               setCommits: {
                 auto: true,
                 ignoreMissing: true,
               },
             },
             sourcemaps: {
               assets: './dist/**',
               filesToDeleteAfterUpload: ['./dist/**/*.map'],
             },
             telemetry: false,
           }),
         ]
       : []),
   ];
   ```

### For GitHub Actions Deployment

1. **Update Deployment Workflow**

   For Lambda deployments using `build-lambda` action:

   ```yaml
   - name: 🏗️ Build and Package Lambda
     uses: ./.github/actions/build-lambda
     with:
       lambda-name: your-lambda
       # ... other params
       sentry-auth-token: ${{ secrets.SENTRY_AUTH_TOKEN }}
       sentry-org: ${{ secrets.SENTRY_ORG }}
       sentry-project: lambda-your-project
   ```

   For direct builds:

   ```yaml
   - name: Build
     env:
       NODE_ENV: production
       SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
       SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
       SENTRY_PROJECT: your-project
       APP_VERSION: ${{ github.sha }}
     run: |
       pnpm exec nx build your-project --configuration=production
   ```

2. **Verify Secrets Are Set**

   Required GitHub secrets:
   - `SENTRY_AUTH_TOKEN`
   - `SENTRY_ORG`

### For Esbuild-based Projects

If using esbuild directly (like `lambdas/websocket`):

1. Install `@sentry/esbuild-plugin`:

   ```bash
   pnpm add -D @sentry/esbuild-plugin
   ```

2. Add to esbuild config:

   ```typescript
   import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';

   plugins: [
     sentryEsbuildPlugin({
       org: process.env.SENTRY_ORG,
       project: process.env.SENTRY_PROJECT,
       authToken: process.env.SENTRY_AUTH_TOKEN,
     }),
   ];
   ```

## Validation

1. **Local Test** (skip upload):

   ```bash
   NODE_ENV=development pnpm exec nx build your-project
   ```

   Should build without attempting Sentry upload.

2. **Production Test** (with upload):

   ```bash
   NODE_ENV=production \
   SENTRY_AUTH_TOKEN=your-token \
   SENTRY_ORG=legacy-sports \
   SENTRY_PROJECT=your-project \
   APP_VERSION=test-1.0.0 \
   pnpm exec nx build your-project --configuration=production
   ```

   Look for: `[sentry-vite-plugin] Successfully uploaded sourcemaps`

3. **Verify in Sentry**:
   - Go to Sentry project
   - Navigate to Releases
   - Find your release (e.g., `your-project@test-1.0.0-abc123`)
   - Check that artifacts (sourcemaps) are uploaded

## Common Project Patterns

### Lambda Function

```typescript
sentryVitePlugin({
  project: 'lambda-{name}',
  release: { name: `{name}@${appVersion}-${commitSha}` },
  sourcemaps: { assets: './dist/**' },
});
```

### Web Application

```typescript
sentryVitePlugin({
  project: 'web',
  release: { name: `web@${appVersion}` },
  sourcemaps: { assets: './dist/web/**' },
});
```

### Library (if tracked separately)

```typescript
sentryVitePlugin({
  project: 'lib-{name}',
  release: { name: `lib-{name}@${version}` },
  sourcemaps: { assets: './dist/**' },
});
```

## Troubleshooting

### Plugin Not Running

- Check `NODE_ENV=production` is set
- Verify `SENTRY_AUTH_TOKEN` is present
- Look for conditional in config: `enableSentry` should be true

### Upload Fails

- Verify token has correct permissions
- Check Sentry project exists
- Ensure organization name is correct

### Wrong Release Name

- Check `APP_VERSION` environment variable
- Verify commit SHA detection works
- Ensure format matches: `project@version-sha`

### Sourcemaps in Bundle

- Verify `filesToDeleteAfterUpload` is set
- Check plugin runs successfully
- Ensure build doesn't exit early on error

## Related Skills

- [Add New Lambda](./add-new-lambda.md)
- [Deploy Web App](./deploy-web-app.md)
- [Configure Build Pipeline](./configure-build-pipeline.md)

## Reference

- Main docs: `docs/deployment/sentry-sourcemap-upload.md`
- Example configs: Check existing lambda `vite.config.mts` files
- Sentry plugin: https://github.com/getsentry/sentry-javascript-bundler-plugins
