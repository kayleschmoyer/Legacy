# Lambda Build Strategy

## Overview

Our Lambda functions are built using a **"build from source"** strategy where Vite bundles all workspace dependencies directly from TypeScript source files, rather than building library projects separately first.

## Why Build From Source?

### Advantages

1. **Tree-shaking optimization** - Vite can analyze and eliminate unused code from our internal libraries
2. **Smaller bundle sizes** - Only the code actually used gets included in the final Lambda bundle
3. **Faster single-lambda builds** - No need to build all library dependencies first
4. **Simpler build process** - One bundler (Vite) handles everything
5. **Single source of truth** - Always building from the latest source, no stale lib outputs

### How It Works

```json
// nx.json - Lambda-specific build target
"targetDefaults": {
  "build:lambda": {
    "cache": true,
    "executor": "nx:run-commands",
    "inputs": ["production"],
    "outputs": ["{projectRoot}/dist"]
    // Note: No dependsOn - we bundle from source
  }
}
```

```json
// lambdas/*/project.json - Each lambda extends this
{
  "targets": {
    "build": {
      "extends": "build:lambda",
      "options": {
        "command": "vite build",
        "cwd": "lambdas/game-selection"
      }
    }
  }
}
```

## Vite Configuration

Each lambda uses Vite with these key settings:

```typescript
// lambdas/*/vite.config.mts
export default defineConfig({
  plugins: [
    nxViteTsPaths()  // Resolves @legacy-sports/* imports from source
  ],
  ssr: {
    noExternal: true  // Bundle all dependencies (except Node.js built-ins)
  },
  build: {
    rollupOptions: {
      external: (id) => {
        // Only externalize Node.js built-in modules
        return ['fs', 'path', 'crypto', ...].includes(id);
      }
    }
  }
});
```

## What Gets Bundled?

- ✅ All `@legacy-sports/*` workspace libraries (from source)
- ✅ All npm dependencies from `node_modules`
- ❌ Node.js built-in modules (fs, path, crypto, etc.)
- ❌ AWS Lambda runtime modules

## Comparison with Traditional Approach

### Traditional: Build Dependencies First

```
┌─────────────────────────────────────────┐
│ 1. Build lib/db-client       (tsc)     │
│ 2. Build lib/logging          (tsc)     │
│ 3. Build lib/utils            (tsc)     │
│ 4. Bundle lambda + built libs (vite)    │
└─────────────────────────────────────────┘
Result: Larger bundle, all lib code included
```

### Our Approach: Bundle From Source

```
┌─────────────────────────────────────────┐
│ 1. Bundle lambda + source libs (vite)   │
└─────────────────────────────────────────┘
Result: Optimized bundle, tree-shaken, faster
```

## When to Use Which Strategy

### Build From Source (Our Lambdas) ✅

Use when:
- Building serverless functions
- Want smallest possible bundle
- Deploy individual services independently
- Tree-shaking is important

### Build Dependencies First

Use when:
- Building publishable libraries
- Multiple projects consume the same libs
- Need to verify lib builds independently
- Building web apps that import pre-built libs

## Performance Impact

Based on our `game-selection` lambda:

- **Build time**: ~5-13 seconds
- **Bundle size**: ~2.5 MB (optimized)
- **No lib builds needed**: Saves ~10-20 seconds per lambda build

## See Also

- [Vite SSR Configuration](https://vite.dev/guide/ssr)
- [Nx Build System Concepts](https://nx.dev/concepts/more-concepts/build-systems)
- [Tree Shaking](https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)
