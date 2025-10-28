# Web Build Configurations

## Overview

This document describes the different build configurations available for the web application and when each should be used.

## Build Configurations

### Development (`development`)

**Purpose**: Local development with hot module replacement

**Usage**:

```bash
pnpm exec nx build web --configuration=development
# or
pnpm exec nx serve web
```

**Characteristics**:

- ✅ Source maps enabled
- ✅ Fast build times
- ❌ No minification
- ❌ No compression reporting
- 🎯 Target: Local development

### Production (`production`)

**Purpose**: CI/CD validation builds

**Usage**:

```bash
pnpm exec nx build web --configuration=production
```

**Characteristics**:

- ❌ Source maps disabled (faster builds)
- ✅ Minification enabled via esbuild
- ❌ No compression reporting
- ❌ No manual chunk splitting
- 🎯 Target: CI/CD validation

**Used by**:

- `.github/actions/build-validation/action.yml` - Validates builds in PR checks
- CI pipeline for merge checks

### Deploy (`deploy`)

**Purpose**: Production deployment artifacts

**Usage**:

```bash
pnpm exec nx build web --configuration=deploy
```

**Characteristics**:

- ✅ Source maps enabled (for production debugging)
- ✅ Minification enabled
- ✅ Compression reporting enabled
- ✅ Manual chunk splitting (optimized bundles)
  - `react-vendor`: React & React-DOM
  - `apollo-vendor`: Apollo Client
  - `tamagui-vendor`: Tamagui UI library
- 🎯 Target: Production deployment to GitHub Pages

**Used by**:

- `.github/workflows/deploy-web.yml` - Deploys to GitHub Pages

## Configuration Details

### Vite Configuration Behavior

The `vite.config.mts` file detects the build configuration and applies appropriate settings:

```typescript
// Detect deploy build
const isDeployBuild = process.env.NX_TASK_TARGET_CONFIGURATION === 'deploy';
const isProduction = mode === 'production' || isDeployBuild;

// Deploy-specific optimizations
build: {
  reportCompressedSize: isDeployBuild || process.env.NX_VERBOSE_LOGGING === 'true',
  minify: isProduction ? 'esbuild' : false,
  sourcemap: isDeployBuild ? true : false,
  rollupOptions: {
    output: {
      manualChunks: isDeployBuild ? {
        'react-vendor': ['react', 'react-dom'],
        'apollo-vendor': ['@apollo/client'],
        'tamagui-vendor': ['tamagui', '@tamagui/core'],
      } : undefined,
    },
  },
}
```

## Build Output Comparison

| Feature            | Development | Production | Deploy      |
| ------------------ | ----------- | ---------- | ----------- |
| Source Maps        | ✅ Yes      | ❌ No      | ✅ Yes      |
| Minification       | ❌ No       | ✅ Yes     | ✅ Yes      |
| Compression Report | ❌ No       | ❌ No      | ✅ Yes      |
| Manual Chunks      | ❌ No       | ❌ No      | ✅ Yes      |
| Build Speed        | ⚡ Fastest  | ⚡ Fast    | 🐢 Slower   |
| Bundle Size        | 📦 Large    | 📦 Small   | 📦 Smallest |
| Debugging          | 🔍 Easy     | 🔍 Hard    | 🔍 Possible |

## Why Separate Configurations?

### CI Build (production) vs Deployment Build (deploy)

**CI Build Goals**:

1. ✅ Verify the application builds without errors
2. ✅ Fast feedback for developers
3. ✅ Validate bundle structure
4. ❌ Don't need production debugging capabilities
5. ❌ Don't need detailed bundle analysis

**Deployment Build Goals**:

1. ✅ Generate optimized production artifacts
2. ✅ Enable production debugging with source maps
3. ✅ Report bundle sizes for monitoring
4. ✅ Optimize chunk splitting for better caching
5. ✅ Include build metadata (version, commit SHA)

## Environment Variables

All configurations have access to the following environment variables:

- `VITE_OAUTH_PROXY_URL` - OAuth proxy endpoint
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `VITE_GRAPHQL_HOST` - GraphQL API endpoint
- `VITE_APP_VERSION` - Application version (e.g., `main-123`)
- `VITE_COMMIT_SHA` - Git commit SHA
- `VITE_BUILD_DATE` - ISO 8601 build timestamp

Deploy builds automatically populate these from GitHub Actions:

- `VITE_APP_VERSION`: `${{ github.ref_name }}-${{ github.run_number }}`
- `VITE_COMMIT_SHA`: `${{ github.sha }}`

## Local Testing

To test each configuration locally:

```bash
# Test development build
pnpm exec nx build web --configuration=development

# Test production build (what CI uses)
pnpm exec nx build web --configuration=production

# Test deploy build (what gets deployed)
pnpm exec nx build web --configuration=deploy

# Preview the deploy build
pnpm exec nx serve web --configuration=production
```

## Troubleshooting

### Source Maps Not Working in Production

Make sure you're using the `deploy` configuration:

```bash
pnpm exec nx build web --configuration=deploy
```

### Build Too Slow in CI

The CI uses the `production` configuration which is optimized for speed. If builds are still slow, check:

1. Nx Cloud cache is enabled
2. DTE (Distributed Task Execution) is available
3. Dependencies haven't changed drastically

### Bundle Size Too Large

Check the deploy build output:

```bash
pnpm exec nx build web --configuration=deploy
```

Look for the compression report and identify large chunks. Consider:

1. Code splitting additional vendor libraries
2. Lazy loading routes
3. Tree shaking unused code

## References

- [Vite Build Options](https://vitejs.dev/config/build-options.html)
- [Nx Build Configuration](https://nx.dev/recipes/executors/use-executor-configurations)
- [Rollup Manual Chunks](https://rollupjs.org/configuration-options/#output-manualchunks)

## Change History

- **2025-10-14**: Implemented separate deploy configuration for production deployments
  - Added `deploy` configuration to `apps/web/project.json`
  - Updated deployment workflow to use `--configuration=deploy`
  - Updated CI validation to use `--configuration=production`
  - Enhanced `vite.config.mts` with deploy-specific optimizations
