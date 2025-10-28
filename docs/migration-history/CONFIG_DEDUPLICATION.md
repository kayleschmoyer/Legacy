# Configuration De-duplication Guide

This workspace has been updated to eliminate configuration duplication across projects using shared configuration files.

## 🎯 Changes Made

### 1. **Shared ESLint Configurations**

Created centralized ESLint configurations in the root directory:

- **`.eslintrc.base.json`** - Base configuration for all projects
- **`.eslintrc.react.json`** - For React-based projects (apps/web, lib/shared-components)
- **`.eslintrc.lambda.json`** - For Lambda functions (lambdas/\*)
- **`.eslintrc.lib.json`** - For library projects (lib/\*)

### 2. **Shared Vite Configurations**

Created reusable Vite configuration functions in `tools/vite-configs/`:

- **`lambda.config.ts`** - For Lambda function builds
- **`lib.config.ts`** - For library builds
- **`web-app.config.ts`** - For web application builds

### 3. **Updated Project Configurations**

Projects now use minimal configuration files that extend the shared configs:

```json
// Before: 20-30 lines of duplicated config
{
  "extends": ["plugin:@nx/react", "../../.eslintrc.json"],
  "ignorePatterns": ["!**/*", ".expo", "web-build", "cache", "dist"],
  "overrides": [
    // ... lots of duplicated rules
  ]
}

// After: 3 lines
{
  "extends": ["../../.eslintrc.react.json"]
}
```

## 📦 How to Use Shared Configs

### For New Projects

#### React Projects (Apps/Components)

```json
// .eslintrc.json
{
  "extends": ["../../.eslintrc.react.json"]
}
```

```typescript
// vite.config.ts
import { createWebAppConfig } from '../../tools/vite-configs';
export default createWebAppConfig('project-name');
```

#### Lambda Functions

```json
// .eslintrc.json
{
  "extends": ["../../.eslintrc.lambda.json"]
}
```

```typescript
// vite.config.mts
import { createLambdaConfig } from '../../tools/vite-configs';
export default createLambdaConfig('project-name');
```

#### Library Projects

```json
// .eslintrc.json
{
  "extends": ["../../.eslintrc.lib.json"]
}
```

```typescript
// vite.config.ts
import { createLibConfig } from '../../tools/vite-configs';
export default createLibConfig('project-name', hasReact);
```

## 🔧 Benefits

1. **Reduced Duplication**: ~90% reduction in configuration lines across projects
2. **Consistent Standards**: All projects follow the same linting and build rules
3. **Easy Updates**: Change config once, applies to all relevant projects
4. **Faster Onboarding**: New projects need minimal configuration
5. **Maintainability**: Centralized configuration management

## 🚀 Migration Commands

To apply these changes to remaining projects:

```bash
# Run the migration script
node tools/scripts/migrate-configs.js

# Test configurations
pnpm exec nx run-many --targets=lint --projects=game-selection,api,shared-components
```

## ⚙️ Customization

Projects can still override specific rules when needed:

```json
{
  "extends": ["../../.eslintrc.react.json"],
  "overrides": [
    {
      "files": ["*.test.ts"],
      "rules": {
        "@typescript-eslint/no-unused-vars": "off"
      }
    }
  ]
}
```

## 🔍 Key Files

- **Root ESLint configs**: `.eslintrc.*.json`
- **Shared Vite configs**: `tools/vite-configs/`
- **Migration script**: `tools/scripts/migrate-configs.js`
- **Updated projects**: Most lambda, lib, and some app projects

This approach significantly reduces maintenance overhead while ensuring consistency across the workspace.
