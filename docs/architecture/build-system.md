# Build System Guide

## 📋 Overview

This document provides comprehensive guidance for the Legacy Sports Nx monorepo build system, including dependency order, build commands, and troubleshooting workflows.

---

## 🏗️ Build Dependencies & Order

The workspace follows a strict dependency hierarchy that **must** be respected for successful builds:

### **Tier 1: Core Foundation Libraries**

Build these **first** - they have no internal dependencies:

```bash
1. env-utilities      # Environment configuration and utilities
2. logging           # Centralized logging infrastructure
3. utils             # Shared utility functions and helpers
```

### **Tier 2: Platform & Configuration Libraries**

Build these **second** - they depend only on Tier 1:

```bash
4. tamagui-config    # UI configuration for cross-platform components
5. ui-abstractions   # Platform abstraction layer for web/mobile
```

### **Tier 3: Data & Infrastructure Libraries**

Build these **third** - they may depend on Tier 1-2:

```bash
6. db-client         # Database connection and query utilities
7. aws-utils         # AWS SDK utilities and helpers
8. bref-client      # Bref serverless utilities (if used)
9. sentry           # Error tracking and monitoring
```

### **Tier 4: Business Logic Libraries**

Build these **fourth** - they depend on data and infrastructure:

```bash
10. api              # GraphQL API schema and resolvers
11. data-loaders     # Data fetching and caching logic
12. scoring          # Game scoring and statistics logic
```

### **Tier 5: UI Component Libraries**

Build these **fifth** - they depend on platform abstractions:

```bash
13. shared-components # Reusable UI components for all platforms
```

### **Tier 6: Applications**

Build these **last** - they consume all other libraries:

```bash
14. web              # React web application
15. app              # React Native mobile application
16. cli              # Command-line interface tools
```

### **Tier 7: Lambda Functions**

Build these independently - they have specific dependency subsets:

```bash
17. db               # Database GraphQL API lambda
18. oauth-proxy      # Authentication proxy lambda
19. draft-processor  # Draft processing worker lambda
20. game-selection   # Game selection logic lambda
21. stats-lambda     # Statistics processing lambda
```

---

## ⚡ Quick Build Commands

### **Full Workspace Build (Recommended)**

```bash
# Build everything in correct dependency order
pnpm run build:all

# Alternative: Use Nx to build all projects
pnpm exec nx run-many --target=build --all
```

### **Incremental Builds by Tier**

```bash
# Build just core libraries (Tier 1-3)
pnpm run build:libs

# Build just applications (Tier 6)
pnpm run build:apps

# Build just lambda functions (Tier 7)
pnpm run build:lambdas

# Build libraries + apps (excludes lambdas)
pnpm run build:libs && pnpm run build:apps
```

### **Development Builds with Watch Mode**

```bash
# Start development with file watching
pnpm run dev

# Development build for specific project
pnpm exec nx serve <project-name>

# Examples:
pnpm exec nx serve web        # Start web dev server
pnpm exec nx serve app        # Start React Native metro bundler
pnpm exec nx dev db          # Start GraphQL lambda in dev mode
```

---

## 🎯 Targeting Specific Groups

Use Nx tags to build related projects together:

### **By Project Type**

```bash
# Libraries only
pnpm exec nx run-many --target=build --projects=tag:scope:lib

# Applications only
pnpm exec nx run-many --target=build --projects=tag:scope:app

# Lambda functions only
pnpm exec nx run-many --target=build --projects=tag:scope:lambda
```

### **By Platform**

```bash
# Shared/cross-platform projects
pnpm exec nx run-many --target=build --projects=tag:platform:shared

# Web-specific projects
pnpm exec nx run-many --target=build --projects=tag:platform:web

# Mobile-specific projects
pnpm exec nx run-many --target=build --projects=tag:platform:mobile
```

### **By Functionality**

```bash
# Data/API related projects
pnpm exec nx run-many --target=build --projects=tag:type:data,tag:type:api

# UI/Component related projects
pnpm exec nx run-many --target=build --projects=tag:type:ui

# Authentication related projects
pnpm exec nx run-many --target=build --projects=tag:type:auth
```

---

## 🔧 Development Workflows

### **New Developer Setup**

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
pnpm run sync-env

# 3. Build core libraries first
pnpm run build:libs

# 4. Start development servers
pnpm run dev          # Starts all dev servers
# OR
npm start           # Starts web app only
```

### **After Pulling Changes**

```bash
# 1. Update dependencies (if package.json changed)
pnpm install

# 2. Rebuild libraries that may have changed
pnpm run build:libs

# 3. Run validation checks
pnpm run validate

# 4. Resume development
pnpm run dev
```

### **Before Committing Changes**

```bash
# 1. Validate workspace integrity
pnpm run validate

# 2. Run type checking
pnpm run typecheck

# 3. Fix linting issues
pnpm run lint:fix:all

# 4. Run tests for changed code
pnpm run test:changed

# 5. Build everything to ensure no breakage
pnpm run build:all
```

---

## 🚨 Troubleshooting Common Build Issues

### **Module Resolution Errors**

```
Error: Cannot find module '@legacy-sports/...'
```

**Solution**: Build dependencies first

```bash
pnpm run build:libs
```

### **TypeScript Compilation Errors**

```
Error: Cannot find type definitions
```

**Solutions**:

```bash
# 1. Rebuild libraries with type definitions
pnpm run build:libs

# 2. Clean and rebuild specific project
pnpm exec nx reset
pnpm exec nx build <project-name>

# 3. Check for circular dependencies
pnpm exec nx graph
```

### **Dependency Version Conflicts**

```
Error: Module version mismatch
```

**Solutions**:

```bash
# 1. Validate and fix workspace dependencies
pnpm run validate:workspace-deps
node scripts/fix-workspace-deps.js

# 2. Clean install dependencies
rm -rf node_modules package-lock.json
pnpm install
```

### **Lambda Build Failures**

```
Error: Lambda packaging failed
```

**Solutions**:

```bash
# 1. Build required libraries first
pnpm run build:libs

# 2. Clean lambda build cache
pnpm exec nx reset

# 3. Build lambda individually
pnpm exec nx build <lambda-name>
```

### **React Native Build Issues**

```
Error: Metro bundler failed
```

**Solutions**:

```bash
# 1. Rebuild UI libraries
pnpm exec nx build tamagui-config
pnpm exec nx build ui-abstractions
pnpm exec nx build shared-components

# 2. Clear Metro cache
pnpm exec nx reset
pnpm exec react-native start --reset-cache

# 3. Rebuild native modules (if needed)
cd apps/app && pnpm exec react-native run-android --reset-cache
```

---

## 📊 Build Performance Tips

### **Optimize Build Speed**

```bash
# Use affected builds (only build changed projects)
pnpm exec nx affected --target=build

# Enable parallel builds (already configured)
pnpm exec nx run-many --target=build --parallel=3

# Use local caching (enabled by default)
# Cache location: node_modules/.nx/cache
```

### **Clean Build Cache When Needed**

```bash
# Clear Nx cache only
pnpm exec nx reset

# Full clean (nuclear option - rebuilds everything)
pnpm run clean:deps
pnpm install
pnpm run build:all
```

---

## 🔍 Build Validation & Health Checks

### **Validate Workspace Health**

```bash
# Full workspace validation
pnpm run validate

# Individual checks
pnpm run validate:package-json        # Check package.json consistency
pnpm run validate:workspace-deps      # Check dependency alignment
pnpm run validate:auth-security       # Check for security issues
```

### **Check Project Dependencies**

```bash
# Visual dependency graph
pnpm exec nx graph

# List affected projects
pnpm exec nx affected:graph

# Show project details
pnpm exec nx show project <project-name>
```

---

## 📝 Build Scripts Reference

### **Available npm Scripts**

```json
{
  "build:all": "nx run-many --target=build --all",
  "build:libs": "nx run-many --target=build --projects=tag:scope:lib",
  "build:apps": "nx run-many --target=build --projects=tag:scope:app",
  "build:lambdas": "nx run-many --target=build --projects=tag:scope:lambda",
  "test:all": "nx run-many --target=test --all",
  "test:libs": "nx run-many --target=test --projects=tag:scope:lib",
  "test:apps": "nx run-many --target=test --projects=tag:scope:app",
  "lint:fix:all": "nx run-many --target=lint --all --fix",
  "clean:nx": "nx reset",
  "clean:deps": "rm -rf node_modules && pnpm install"
}
```

### **Nx Target Configuration**

Key build targets available for all projects:

- `build`: Compile/bundle the project
- `test`: Run unit tests
- `lint`: Run ESLint with error checking
- `format`: Format code with Prettier
- `typecheck`: TypeScript type checking
- `serve/dev`: Development server (apps/lambdas)

---

## 🎯 Build Success Criteria

✅ **All projects build successfully**  
✅ **No TypeScript compilation errors**  
✅ **All tests pass**  
✅ **No ESLint errors or warnings**  
✅ **Dependency validation passes**  
✅ **No circular dependencies detected**

---

## 📚 Additional Resources

- **Nx Documentation**: [https://nx.dev](https://nx.dev)
- **Project Configuration**: See individual `project.json` files in each project
- **Workspace Configuration**: `nx.json`, `package.json`
- **Dependency Management**: `scripts/validate-workspace-deps.js`
- **Troubleshooting**: `DEVELOPMENT_SETUP.md` (when created)

---

_Last Updated: October 12, 2025_  
_Build System Version: Nx 21.5.2_
