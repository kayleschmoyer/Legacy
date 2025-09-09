# Package.json Standards & PR Checks

This document describes the package.json standards and automated PR checks implemented for the Legacy Sports NX workspace.

## 🎯 Overview

We've implemented automated PR checks to ensure all `package.json` files across the workspace follow NX best practices. This prevents dependency conflicts, maintains consistency, and ensures proper workspace management.

## 📋 Standards Enforced

### 1. **Scoped Naming**

```json
{
  "name": "@legacy-sports/project-name"
}
```

- All packages must use the `@legacy-sports/` scope
- Prevents conflicts and provides clear ownership

### 2. **Consistent Versioning**

```json
{
  "version": "0.0.1"
}
```

- All workspace packages use version `0.0.1`
- Root package.json manages actual versioning

### 3. **Private Flag**

```json
{
  "private": true
}
```

- Prevents accidental publishing to npm
- Required for all workspace packages

### 4. **Source Paths (Libraries)**

```json
{
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

- Libraries should point to TypeScript source files
- Allows proper IDE intellisense and NX builds

### 5. **Clean Metadata**

```json
{
  // ❌ Remove these fields:
  // "description": "...",
  // "author": "...",
  // "license": "..."
}
```

- Remove unnecessary boilerplate fields
- Keep configurations minimal and focused

### 6. **Wildcard Dependencies**

```json
{
  "dependencies": {
    "@apollo/client": "*",
    "@legacy-sports/utils": "*"
  }
}
```

- Use `"*"` for dependencies managed in root `package.json`
- Ensures version consistency across workspace

### 7. **Important Scripts Preservation**

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6009",
    "build": "vite build"
  }
}
```

- Keep build, test, dev, and tool-specific scripts
- Remove empty `"scripts": {}` objects

## 🚀 PR Check Implementation

### GitHub Workflows

1. **Primary Check**: `.github/workflows/validate-package-json.yml`
   - Runs on package.json changes
   - Fast validation (< 5 minutes)
   - Provides helpful PR comments

2. **CI Integration**: Enhanced `.github/workflows/ci.yml`
   - Runs validation before main CI tasks
   - Prevents builds with invalid configurations

### Local Commands

```bash
# Validate package.json standards
npm run validate:package-json

# Validate workspace dependencies
npm run validate:workspace-deps

# Run both validations
npm run validate

# NX targets
npx nx validate:package-json
npx nx validate:workspace-deps
npx nx validate
```

## 🛠️ How to Fix Issues

### When PR Checks Fail

1. **Run Local Validation**

   ```bash
   npm run validate
   ```

2. **Read Error Messages**
   The validation script provides specific guidance:

   ```
   📁 lib/my-package:
     ❌ Name should start with "@legacy-sports/" but is "my-package"
     ❌ Should have "private": true but has "undefined"
   ```

3. **Fix According to Standards**
   Update your `package.json` according to the error messages

4. **Examples**
   Look at existing packages in `lib/` for reference:
   - `lib/utils/package.json` - Simple library
   - `lib/shared-components/package.json` - With Storybook scripts
   - `lib/db-client/package.json` - With database scripts

### Common Fixes

```json
{
  "name": "@legacy-sports/my-package", // ✅ Add scope
  "version": "0.0.1", // ✅ Standard version
  "private": true, // ✅ Add private flag
  "main": "./src/index.ts", // ✅ Point to source
  "types": "./src/index.ts", // ✅ Point to source
  "scripts": {
    "build": "vite build" // ✅ Keep important scripts
  },
  "dependencies": {
    "react": "*" // ✅ Use wildcards
  }
}
```

## 📖 Benefits

### For Developers

- **Consistent Experience**: All packages follow same patterns
- **Better IDE Support**: Proper paths enable intellisense
- **Faster Builds**: Optimized dependency resolution

### For the Project

- **No Version Conflicts**: Centralized dependency management
- **Easier Maintenance**: Consistent package structures
- **Automated Quality**: PR checks prevent regressions

### For CI/CD

- **Faster Pipelines**: Efficient dependency resolution
- **Reliable Builds**: Consistent configurations
- **Early Detection**: Issues caught before merge

## 🔧 Maintenance

### Adding New Packages

When creating new packages:

1. Follow the naming convention: `@legacy-sports/package-name`
2. Set version to `0.0.1` and `private: true`
3. Use wildcard dependencies for shared packages
4. Point main/types to `./src/index.ts` for libraries
5. Test with `npm run validate`

### Updating Dependencies

1. Add new dependencies to root `package.json`
2. Use `"*"` in project package.json files
3. Run `npm install` to sync versions
4. Validate with `npm run validate`

### Script Guidelines

- **Keep**: Build, test, dev, storybook, codegen scripts
- **Remove**: Empty scripts objects, generic npm boilerplate
- **Preserve**: Tool-specific configurations (Drizzle, React Native, etc.)

## 📊 Monitoring

The validation runs:

- ✅ On every PR with package.json changes
- ✅ On main branch pushes
- ✅ In local development with `npm run validate`
- ✅ As part of the main CI pipeline

Failed checks block PR merges and provide actionable feedback for quick resolution.
