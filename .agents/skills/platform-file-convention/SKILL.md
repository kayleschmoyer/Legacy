---
name: platform-file-convention
description: 'Use the correct platform file variants in shared libraries: index.ts (universal), index.native.ts (mobile), server.ts (Node.js). Load before creating platform-variant files, adding libraries with platform splits, or debugging bundler resolution errors.'
---

# Skill: Platform File Convention

## Overview

This monorepo uses **React Native file extension conventions** for platform-variant code in shared libraries. The convention determines which bundler (Vite, Metro, esbuild) picks up which file variant.

## When to Use

- Creating a new shared library with platform-specific code
- Adding platform variants to an existing library
- Debugging "not exported" or "module not found" errors in Vite/Storybook/Metro builds
- Reviewing PRs that add `.web.ts` or `.native.ts` files

## Convention

| File              | Platform                          | Resolved By                                                            |
| ----------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `index.ts`        | Universal (web + Node.js default) | Vite (via nxViteTsPaths), esbuild, Jest                                |
| `index.native.ts` | Mobile (React Native)             | Metro (via `react-native` package.json field + `.native.ts` extension) |
| `server.ts`       | Server-only (Node.js / Lambda)    | Explicit tsconfig subpath: `@pkg/server`                               |

### Key Rules

1. **`index.ts` is the universal entry** — it must be browser-safe (no `fs`, `path`, `process.on`, etc.)
2. **Never create `.web.ts` entry files** — bare `.ts` IS the web entry per React Native convention. Vite's `.web.ts` extension priority causes Frankenstein module resolution when mixed with nxViteTsPaths.
3. **`.native.ts` is for Metro only** — Metro resolves `.native.ts` before `.ts`; other bundlers ignore it.
4. **Server-only code uses explicit subpaths** — e.g., `@legacy-sports/logging/server` mapped via tsconfig paths to `server.ts`. This avoids bundlers accidentally pulling in Node.js APIs.

## File Layout Example (`lib/logging`)

```
lib/logging/src/
├── index.ts              ← Universal (console-only LOGGER)
├── index.native.ts       ← Mobile (Metro picks this up)
├── server.ts             ← Server (file output + process handlers)
├── lib/
│   ├── factories.ts          ← Universal factories
│   ├── factories.native.ts   ← Mobile factories
│   ├── factories.server.ts   ← Server factories (FileOutputDestination)
│   └── destinations/
│       ├── index.ts           ← Universal (ConsoleOutputDestination)
│       ├── index.native.ts    ← Mobile
│       └── server.ts          ← Server (Console + File destinations)
```

## Configuration

### tsconfig.base.json

Map the main entry and any explicit subpaths:

```json
{
  "compilerOptions": {
    "paths": {
      "@legacy-sports/logging": ["lib/logging/src/index.ts"],
      "@legacy-sports/logging/server": ["lib/logging/src/server.ts"]
    }
  }
}
```

### package.json (library)

```json
{
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "react-native": "./src/index.native.ts"
}
```

- `main` / `types` → universal `index.ts`
- `react-native` → Metro entry (no `browser` field needed since `index.ts` is already browser-safe)

## Consumer Import Patterns

```typescript
// Web, Storybook, shared libs, tests — universal entry
import { LOGGER } from '@legacy-sports/logging';

// React Native — Metro auto-resolves to index.native.ts
import { LOGGER } from '@legacy-sports/logging';

// Lambda, CLI, server code — explicit server subpath
import { LOGGER, FileOutputDestination } from '@legacy-sports/logging/server';
import { registerGlobalErrorCapture } from '@legacy-sports/logging/server';
```

## Why No `.web.ts` Entry Files?

Vite resolves imports in this order:

1. Manual aliases (highest priority)
2. nxViteTsPaths (from tsconfig paths → `index.ts`)
3. package.json fields
4. Extension priority (`.web.ts` > `.ts` for internal imports)

The problem: nxViteTsPaths resolves `@legacy-sports/logging` to `index.ts` (the entry), but Vite's extension priority swaps **internal** imports (e.g., `./lib/factories`) to their `.web.ts` variants. This creates a Frankenstein module where the entry expects server exports but internals provide web-only exports.

By making `index.ts` universal, no aliases or extension swapping is needed — everything resolves consistently.

## Applying to Other Libraries

When creating a new library with platform splits, follow this pattern:

1. **Universal entry** (`index.ts`): Browser-safe, no Node.js APIs
2. **Mobile entry** (`index.native.ts`): Only if mobile needs different behavior
3. **Server subpath** (`server.ts`): Only if there are Node.js-only exports
4. **Internal files**: Same pattern — `foo.ts` (universal), `foo.native.ts` (mobile), `foo.server.ts` (server)
5. **tsconfig paths**: Add `@legacy-sports/<pkg>/server` subpath if `server.ts` exists

Existing libraries using this pattern: `logging`, `rollbar` (uses `/web` and `/native` subpaths).

## Troubleshooting

| Symptom                               | Cause                                               | Fix                                                       |
| ------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| "X is not exported" in Vite/Storybook | `.web.ts` extension hijacking internal imports      | Remove `.web.ts` files; make bare `.ts` browser-safe      |
| FileOutputDestination in web bundle   | `index.ts` is the server entry, not universal       | Restructure: `index.ts` = universal, `server.ts` = server |
| Metro picks wrong file                | Missing `react-native` field in package.json        | Add `"react-native": "./src/index.native.ts"`             |
| Lambda missing server exports         | Importing from universal entry instead of `/server` | Change to `@legacy-sports/logging/server`                 |
