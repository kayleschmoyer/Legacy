# Vite CJS Deprecation Warning Fix

## ✅ Issue Resolved

Fixed the Vite CJS (CommonJS) Node API deprecation warning that was appearing in all builds:

```
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
```

## Solution Applied

Renamed all `vite.config.ts` files to `vite.config.mts` to force ESM (ECMAScript Module) loading instead of CommonJS.

### Files Changed:

```
apps/web/vite.config.ts                   → apps/web/vite.config.mts
apps/graphql-explorer/vite.config.ts      → apps/graphql-explorer/vite.config.mts
lambdas/db/vite.config.ts                 → lambdas/db/vite.config.mts
lambdas/game-selection/vite.config.ts     → lambdas/game-selection/vite.config.mts
lambdas/oauth-proxy/vite.config.ts        → lambdas/oauth-proxy/vite.config.mts
lambdas/stats-lambda/vite.config.ts       → lambdas/stats-lambda/vite.config.mts
```

## Why This Works

- The `.mts` extension explicitly tells Node.js to treat the file as an ES module
- This prevents Vite from being loaded through the deprecated CommonJS API
- Maintains full compatibility with existing configuration syntax
- No breaking changes to functionality

## Verification

✅ **Web builds clean**: `npx nx build web`  
✅ **Lambda builds clean**: `npx nx build db`  
✅ **Development server runs**: `npx nx serve web`  
✅ **No deprecation warnings**: All output clean

## Benefits

- Eliminates annoying deprecation warnings in console
- Future-proofs the build system for Vite v7+
- Aligns with modern ESM best practices
- Maintains full Nx integration compatibility

## Technical Details

The warning occurred because:

1. Vite v6+ deprecated the CommonJS Node API
2. Nx was calling Vite through CommonJS context
3. The `.ts` extension defaulted to CommonJS in this monorepo context
4. The `.mts` extension forces ESM loading, resolving the issue

This is the recommended solution from the [Vite troubleshooting guide](https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated).
