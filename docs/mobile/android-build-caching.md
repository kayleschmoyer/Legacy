# Android Build Caching Strategy

## Overview

This document describes the comprehensive caching strategy implemented for Android builds in LS-118 to significantly improve build times when the Android package and its dependencies haven't changed.

## Caching Layers

Our Android build process now utilizes multiple layers of caching to optimize build performance:

### 1. Nx Computation Caching

**Location**: Local `.nx/cache` directory and optional Nx Cloud

**What it caches**: Entire build outputs when inputs haven't changed

**Configuration**: `nx.json` and `apps/app/project.json`

```json
"build-android": {
  "cache": true,
  "inputs": [
    "default",
    "^production",
    "{projectRoot}/android/**/*",
    "{projectRoot}/index.js",
    "{projectRoot}/metro.config.js",
    "{projectRoot}/babel.config.js",
    "{workspaceRoot}/android/**/*",
    "{workspaceRoot}/app.json",
    "{workspaceRoot}/babel.config.json"
  ],
  "outputs": [
    "{projectRoot}/android/app/build/outputs/apk",
    "{projectRoot}/android/app/build/intermediates/merged_assets"
  ]
}
```

**Benefits**:

- ✅ Skip entire build when nothing changed
- ✅ Restore APK outputs instantly (~30s instead of 10-15 minutes)
- ✅ Works locally and in CI
- ✅ Respects library dependencies via `^production` input

### 2. Gradle Build Cache

**Location**: `~/.gradle/caches/build-cache-1/`

**What it caches**: Compiled Java/Kotlin classes, processed resources, Dex files

**Configuration**: GitHub Actions workflow caches Gradle directories

**Benefits**:

- ✅ Speeds up incremental Gradle builds
- ✅ Reuses compiled classes when source code hasn't changed
- ✅ 40-60% faster builds when some files change

### 3. Gradle Dependencies Cache

**Location**: `~/.gradle/caches/modules-2/`, `~/.gradle/wrapper/`

**What it caches**: Downloaded Gradle dependencies and wrapper distributions

**Configuration**: GitHub Actions `actions/cache@v5`

**Cache Key**: Based on `gradle-wrapper.properties` and `build.gradle` files

**Benefits**:

- ✅ Eliminates dependency downloads (saves 2-5 minutes)
- ✅ Faster Gradle daemon startup
- ✅ Reduces network traffic

### 4. Metro Bundler Cache

**Location**: `~/.metro/`, `node_modules/.cache/metro/`, `/tmp/metro-*`

**What it caches**: Transformed JavaScript modules, Babel outputs

**Configuration**: GitHub Actions workflow

**Cache Key**: Based on `package.json` and `metro.config.js`

**Benefits**:

- ✅ Faster JavaScript bundling (saves 1-3 minutes)
- ✅ Reuses transformed modules when source unchanged
- ✅ Improves Metro startup time

### 5. Hermes Compiler Cache

**Location**: `android/app/build/generated/assets/react/`, `android/app/build/intermediates/merged_assets/`

**What it caches**: Compiled Hermes bytecode for JavaScript bundle

**Configuration**: GitHub Actions workflow

**Cache Key**: Based on all JS/TS source files in `apps/app/src/` and `lib/`

**Benefits**:

- ✅ Skip Hermes compilation when JS unchanged
- ✅ Faster APK generation (saves 1-2 minutes)
- ✅ Reduces CPU usage during builds

### 6. Android SDK Cache

**Location**: `~/.android/sdk/`, `/usr/local/lib/android/sdk/`

**What it caches**: Android SDK tools, platforms, build-tools

**Configuration**: GitHub Actions workflow

**Cache Key**: Based on API level and NDK version

**Benefits**:

- ✅ Eliminates SDK downloads (saves 1-3 minutes on fresh runners)
- ✅ Consistent build environment
- ✅ Faster setup time

## Cache Invalidation Strategy

Caches are invalidated when their inputs change:

| Cache Type       | Invalidates When                                                       |
| ---------------- | ---------------------------------------------------------------------- |
| **Nx Cache**     | Any source file, android config, dependencies, or upstream lib changes |
| **Gradle Build** | Java/Kotlin source, android configs, or gradle files change            |
| **Gradle Deps**  | `build.gradle` or `gradle-wrapper.properties` changes                  |
| **Metro**        | JS/TS source files, `metro.config.js`, or `package.json` changes       |
| **Hermes**       | Any JS/TS source file changes in app or libraries                      |
| **Android SDK**  | API level or NDK version changes                                       |

## Expected Performance Improvements

### Scenario 1: No Changes (Best Case)

**Before**: 10-15 minutes  
**After**: ~30 seconds  
**Improvement**: ~95% faster ⚡

Nx detects no changes and restores APK from cache instantly.

### Scenario 2: Library Changes Only

**Before**: 10-15 minutes  
**After**: ~2-4 minutes  
**Improvement**: ~70% faster ⚡

Nx rebuilds affected libraries, reuses Gradle/Metro caches for Android native code.

### Scenario 3: Android Native Changes

**Before**: 10-15 minutes  
**After**: ~6-8 minutes  
**Improvement**: ~40% faster ⚡

Gradle build cache helps with incremental compilation.

### Scenario 4: Fresh Runner / Cache Miss

**Before**: 12-17 minutes (includes downloads)  
**After**: ~10-15 minutes  
**Improvement**: Baseline performance

All caches need to be populated, but subsequent builds benefit.

## Monitoring Cache Effectiveness

The workflow now reports cache status at multiple points:

### 1. Before Build

```bash
📊 Current cache status:
  Gradle wrapper: X files
  Gradle caches: X entries
  Gradle build cache: X entries
  Metro cache: X files
  Node modules: X packages
  Android SDK: X components
```

### 2. During Build

```bash
📊 Cache Status Summary:
  Gradle Wrapper: X items
  Gradle Dependencies: X items
  Gradle Build Cache: X items
  Kotlin Cache: X items
  Metro Cache: X items
  Hermes Cache: X items
```

### 3. After Build

```bash
📊 Final Cache Summary:
  Gradle caches: XXX MB
  Gradle build cache: XXX MB
  Metro cache: XXX MB
  Android SDK: X.X GB
```

## Cache Size Management

To prevent cache bloat and slow compression:

1. **Lock files removed**: Gradle `.lock` files deleted after build
2. **Temporary files cleaned**: Incremental build intermediates removed
3. **Build logs excluded**: Large log files not cached
4. **Selective caching**: Only essential artifacts preserved

## CI/CD Integration

### GitHub Actions Configuration

The workflow uses:

- `actions/cache@v5` for all cache layers
- Compression level 1 (faster compression, acceptable compression ratio)
- 5GB cache size limit
- Automatic cache cleanup on job completion

### Nx Remote Caching (Optional)

For team collaboration, enable Nx Cloud:

```bash
# Set this in GitHub Secrets
NX_CLOUD_ACCESS_TOKEN=your-token-here
```

Benefits with Nx Cloud:

- ✅ Share cache across team members
- ✅ Share cache across CI jobs
- ✅ Distributed task execution
- ✅ Build insights and analytics

## Troubleshooting

### Cache Not Being Used

**Symptoms**: Build always takes 10-15 minutes

**Solutions**:

1. Check Nx cache: `pnpm exec nx show project app --web` and verify cache is enabled
2. Verify GitHub Actions cache: Look for "Cache hit" or "Cache miss" in workflow logs
3. Check cache keys match: Ensure `build.gradle` hasn't changed
4. Clear and rebuild: `pnpm exec nx reset` then rebuild

### Cache Size Growing Too Large

**Symptoms**: CI jobs failing with cache size errors

**Solutions**:

1. Increase `ACTIONS_CACHE_MAX_SIZE` in workflow (currently 5GB)
2. Run cache cleanup: Workflow automatically cleans after each build
3. Clear old caches: Delete unused cache keys in GitHub Settings → Actions → Caches

### Stale Cache Causing Build Issues

**Symptoms**: Build succeeds but APK doesn't reflect recent changes

**Solutions**:

1. Force rebuild: `pnpm exec nx build-android app --skip-nx-cache`
2. Clear Nx cache: `pnpm exec nx reset`
3. Clear Gradle cache: `cd apps/app/android && ./gradlew clean`
4. Clear all caches: Delete GitHub Actions cache keys

## Best Practices

### Local Development

1. **Use Nx commands**: `pnpm exec nx build-android app` (benefits from local cache)
2. **Avoid manual Gradle commands**: Bypass Nx caching
3. **Clear caches when switching branches**: `pnpm exec nx reset` after major changes

### CI/CD

1. **Monitor cache hit rates**: Check workflow logs regularly
2. **Keep dependencies stable**: Fewer `package.json` changes = better cache hits
3. **Separate android changes**: Dedicated PRs for android config changes
4. **Review cache sizes**: Ensure caches stay under 5GB limit

## Related Documentation

- [Android Build Setup](android-build-setup.md)
- [Android Version Matrix](android-version-matrix.md)
- [Mobile Build Automation](mobile-build-automation.md)
- [Nx Build System](../architecture/build-system.md)

## Implementation Details

**Jira Ticket**: [LS-118](https://bkrupa.atlassian.net/browse/LS-118)  
**Pull Request**: TBD  
**Date Implemented**: February 2026  
**Version**: 1.0.0
