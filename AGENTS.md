# AI Agent Instructions for Legacy Sports

## Overview

This document provides essential guidance for AI agents working on the Legacy Sports codebase. Please read and understand these instructions before making any code changes.

## 🏗️ Platform Components Magic String System

### **CRITICAL: Understanding the Platform Abstraction**

The most important system to understand in this codebase is the **Platform Components Magic String System**. This enables cross-platform compatibility between web and React Native.

#### **How It Works**

1. **Consumer Code** imports from the abstraction layer:

   ```typescript
   import { OAuthProvider, FlatList, Platform } from './platform-components';
   ```

2. **Magic String Resolution** - The file `platform-components/index.ts` exports from:

   ```typescript
   import platformComponents from '__PLATFORM_COMPONENTS__';
   ```

3. **Build-Time Replacement** - Vite resolves the magic string based on target:

   ```typescript
   // vite.config.mts
   resolve: {
     alias: {
       '__PLATFORM_COMPONENTS__': `src/platform-components/${platform}/index.ts`
     }
   }
   ```

4. **Platform-Specific Implementation**:
   - **Web builds**: `__PLATFORM_COMPONENTS__` → `./web/index.ts`
   - **Mobile builds**: `__PLATFORM_COMPONENTS__` → `./mobile/index.ts`

5. **Final Bundle** contains ONLY platform-specific code (no runtime platform detection)

#### **Key Rules for Platform Components**

✅ **DO:**

- Add new platform implementations to both `web/index.ts` AND `mobile/index.ts`
- Export new components through the magic string in `platform-components/index.ts`
- Add shared types to `platform-components/types/` directory
- Use the build-time resolution system for platform differences

❌ **DON'T:**

- Import platform-specific files directly (`./web/ReactNativeEquivalents` ❌)
- Add runtime platform detection in the abstraction layer
- Replace magic string exports with direct imports
- Use dynamic imports/requires (defeats build-time optimization)

#### **Example: Adding a New Platform Component**

1. **Add type definition** in `platform-components/types/platform-exports.ts`:

   ```typescript
   interface PlatformExports {
     // ... existing components
     NewComponent: React.ComponentType<{ prop: string }>;
   }
   ```

2. **Add web implementation** in `platform-components/web/index.ts`:

   ```typescript
   export { WebNewComponent as NewComponent } from './ReactNativeEquivalents';
   ```

3. **Add mobile implementation** in `platform-components/mobile/index.ts`:

   ```typescript
   export { NewComponent } from 'react-native';
   ```

4. **Export from abstraction layer** in `platform-components/index.ts`:
   ```typescript
   export const {
     // ... existing exports
     NewComponent,
   } = validatePlatformExports(platformComponents);
   ```

## 📏 Type Safety Standards

### **Firm Types Policy**

**PRIORITY: Use strong, specific types wherever possible.**

✅ **Preferred Type Patterns:**

```typescript
// Specific object shapes
interface UserData {
  id: number;
  name: string;
  email: string;
}

// Union types for known values
type Status = 'loading' | 'success' | 'error';

// Generic constraints
interface ApiResponse<T> {
  data: T;
  status: number;
}

// Platform-safe property types
style?: React.CSSProperties; // For web-compatible styles
platformStyle?: Record<string, unknown>; // For cross-platform styles
```

❌ **Avoid `any` Types:**

```typescript
// BAD
const userData: any = fetchUser();
const styles: any = getStyles();

// GOOD
const userData: UserData = fetchUser();
const styles: React.CSSProperties = getStyles();
```

### **When `any` is Acceptable**

Only use `any` in these specific cases (with explanatory comments):

1. **Complex External Library Types:**

   ```typescript
   // Tamagui config has complex generic constraints
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   tamaguiConfig: any;
   ```

2. **React Native Animation API:**

   ```typescript
   // React Native Animated.Value has complex interpolation methods
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   animatedValue: any;
   ```

3. **Platform Compatibility:**

   ```typescript
   // Platform-specific global object modification
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   (window as any).StyleSheet = StyleSheet;
   ```

4. **Test/Example Code:**
   ```typescript
   // Mock configuration for examples only
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const mockConfig = {} as any;
   ```

## 🔧 ESLint Standards

### **ESLint Enforcement Policy**

**PRIORITY: Fix the root cause rather than disabling rules.**

✅ **Preferred Solutions:**

```typescript
// Instead of disabling @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any ❌

// Create proper types
interface PlayerData {
  firstName: string;
  lastName: string;
  id: number;
}
const player: PlayerData = getPlayer(); ✅
```

✅ **When ESLint Disabling is Acceptable:**

1. **Documented Platform Compatibility:**

   ```typescript
   // Required for React Native/Web platform abstraction
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   ```

2. **External Library Constraints:**

   ```typescript
   // External library has incompatible type definitions
   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
   ```

3. **Generated Code:**
   ```typescript
   // Generated by GraphQL codegen
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   ```

❌ **Don't Disable for Convenience:**

```typescript
// BAD - Just avoiding proper typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response;

// GOOD - Proper type definition
interface ApiResponse {
  users: User[];
  pagination: PaginationInfo;
}
const data: ApiResponse = response;
```

## 🚀 Development Workflow

### **Before Making Changes**

1. **Understand the platform implications** - Will this affect web, mobile, or both?
2. **Check existing types** - Look for existing interfaces before creating new ones
3. **Verify platform components** - Ensure both web and mobile implementations exist
4. **Run type checks** - Use `make typecheck` to verify TypeScript compliance

### **🚨 Fail Fast, Fail Early Philosophy**

**PRIORITY: Surface problems immediately rather than hiding or working around them.**

This codebase follows a strict "fail fast, fail early" approach to maintain code quality and developer productivity:

✅ **DO - Let Systems Fail Clearly:**

```typescript
// GOOD - Let TypeScript catch the error
interface UserData {
  id: number;
  name: string;
}
const user: UserData = fetchUser(); // Will fail at compile time if wrong type

// GOOD - Let validation fail immediately
if (!isValidEmail(email)) {
  throw new Error(`Invalid email format: ${email}`);
}

// GOOD - Let builds fail on lint errors
// Don't suppress ESLint rules - fix the root cause instead
```

✅ **DO - Fail Fast in CI/CD:**

- **Validation errors**: Let package.json validation fail the workflow completely
- **Type errors**: Fail builds immediately on TypeScript errors
- **Lint errors**: Fail on ESLint violations, don't suppress them
- **Test failures**: Stop the pipeline, don't continue with broken tests
- **Permission errors**: Fix root cause permissions, don't catch and hide errors

❌ **DON'T - Hide or Work Around Problems:**

```typescript
// BAD - Hiding type errors
const data: any = riskyOperation(); // Defeats type safety

// BAD - Suppressing validation
try {
  validatePackageJson();
} catch {
  console.log('Validation failed, but continuing anyway...'); // ❌
}

// BAD - Overly broad error handling
try {
  await github.rest.issues.createComment();
} catch (error) {
  // Catches ALL errors, not just expected ones ❌
  console.log('Something went wrong, ignoring...');
}
```

✅ **GOOD - Targeted Problem Solving:**

```typescript
// GOOD - Fix root cause with precise conditions
if (github.event_name === 'pull_request' && github.event.pull_request != null) {
  await github.rest.issues.createComment(); // Only when appropriate
}

// GOOD - Handle specific expected errors only
catch (error) {
  if (error.status === 403 && error.message.includes('Resource not accessible')) {
    // Handle this specific known case
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

#### **Why This Matters**

1. **Faster Debugging**: Problems surface immediately at their source
2. **Cleaner Codebase**: No hidden issues accumulating over time
3. **Better Developer Experience**: Clear error messages guide fixes
4. **Reliable CI/CD**: Pipelines catch issues before they reach production
5. **Maintainable Code**: Future developers understand failure modes clearly

#### **When Working with GitHub Actions**

- **Fix permission issues** by setting correct permissions, not catching errors
- **Fix context issues** by checking proper conditions, not broad try-catch
- **Let validation fail** when standards aren't met - that's the point of validation
- **Surface configuration problems** immediately rather than working around them

### **Code Quality Checks**

```bash
# Required checks before committing
make typecheck          # TypeScript validation
make lint              # ESLint validation
make test              # Unit tests
make build             # Build validation
```

### **Platform Testing**

```bash
# Test both platforms
make build-web         # Verify web build
make build-mobile      # Verify mobile build (if React Native setup available)
```

## 📚 Key Files to Understand

- **`platform-components/index.ts`** - Main abstraction layer
- **`platform-components/types/platform-exports.ts`** - Type definitions
- **`platform-components/web/index.ts`** - Web implementations
- **`platform-components/mobile/index.ts`** - Mobile implementations
- **`vite.config.mts`** - Build-time magic string resolution
- **`.eslintrc.json`** - Linting rules and standards

## 🎯 Success Criteria

When working on this codebase, ensure:

✅ **Platform Compatibility** - Code works on both web and React Native  
✅ **Type Safety** - Strong typing with minimal `any` usage  
✅ **Build Success** - All targets compile without errors  
✅ **Lint Compliance** - No ESLint errors or warnings  
✅ **Test Coverage** - Existing tests pass, new features have tests  
✅ **Documentation** - Complex decisions are documented in code comments  
✅ **Fail Fast Philosophy** - Problems surface immediately, no error hiding or workarounds

## 🆘 Common Pitfalls

1. **Breaking Platform Abstraction** - Importing platform-specific files directly
2. **Type Shortcuts** - Using `any` instead of proper interfaces
3. **ESLint Avoidance** - Disabling rules instead of fixing root causes
4. **Build Assumptions** - Not testing changes on both web and mobile platforms
5. **Magic String Confusion** - Not understanding how `__PLATFORM_COMPONENTS__` works
6. **Error Suppression** - Catching and hiding errors instead of fixing root causes
7. **Workaround Mentality** - Working around problems instead of solving them properly

## 🛠️ Repository Tooling & Architecture

### **Monorepo Structure (Nx Workspace)**

This is an **Nx monorepo** with multiple applications and shared libraries:

```
legacy-sports/
├── apps/                    # Applications
│   ├── app/                # React Native mobile app
│   ├── web/                # Web application (Vite + React)
│   ├── cli/                # CLI tools
│   └── graphql-explorer/   # GraphQL playground
├── lib/                    # Shared libraries
│   ├── shared-components/  # Cross-platform UI components
│   ├── api/               # GraphQL API layer
│   ├── db-client/         # Database utilities
│   ├── tamagui-config/    # UI system configuration
│   └── utils/             # Shared utilities
├── lambdas/               # AWS Lambda functions
│   ├── oauth-proxy/       # Authentication proxy
│   ├── stats-lambda/      # Statistics processing
│   └── game-selection/    # Game selection logic
└── terraform/             # Infrastructure as code
```

### **Build System & Tools**

- **Build Tool**: Vite (fast, modern bundler)
- **Monorepo**: Nx (task runner, dependency graph, caching)
- **Package Manager**: npm (with workspaces)
- **Task Automation**: Make (cross-platform Makefile)
- **Language**: TypeScript (strict mode enabled)
- **Mobile Framework**: React Native 0.79.6
- **UI System**: Tamagui (cross-platform design system)

### **Key Development Tools**

```bash
# Primary Commands
make help              # Show all available commands
make install          # Install all dependencies (Node + Python)
make build            # Build all projects
make test             # Run all tests
make lint             # Run ESLint + fix issues
make dev              # Start development servers

# Platform-specific
make android          # Run Android app
make ios              # Run iOS app
make dev:web          # Start web development server
```

### **Code Quality Stack**

- **Linting**: ESLint (error-level enforcement)
- **Formatting**: Prettier (LF line endings)
- **Type Checking**: TypeScript strict mode
- **Testing**: Jest + Playwright (E2E)
- **Git**: Conventional commits, .gitattributes normalization

## 📦 Package Architecture

### **Application Packages**

1. **`apps/app`** - React Native Mobile App
   - **Platform**: iOS + Android
   - **Framework**: React Native + Expo
   - **Navigation**: React Navigation
   - **State**: Apollo Client (GraphQL)

2. **`apps/web`** - Web Application
   - **Platform**: Web browsers
   - **Framework**: React + Vite
   - **Routing**: React Router
   - **State**: Apollo Client (GraphQL)

3. **`apps/cli`** - Command Line Tools
   - **Platform**: Node.js
   - **Purpose**: Development utilities, scripts
   - **Framework**: Commander.js

### **Library Packages**

1. **`lib/shared-components`** - Cross-Platform UI
   - **Purpose**: Shared React components (web + mobile)
   - **Key Feature**: Platform abstraction via magic strings
   - **Storybook**: Component documentation + testing

2. **`lib/api`** - GraphQL API Layer
   - **Purpose**: GraphQL schema, resolvers, data fetching
   - **Framework**: Apollo Server
   - **Database**: PostgreSQL via Drizzle ORM

3. **`lib/tamagui-config`** - Design System
   - **Purpose**: Tamagui configuration (themes, tokens, fonts)
   - **Cross-platform**: Web + React Native styling

4. **`lib/db-client`** - Database Layer
   - **Purpose**: Database connections, migrations, utilities
   - **ORM**: Drizzle (type-safe SQL)
   - **Database**: PostgreSQL

### **Lambda Functions**

1. **`lambdas/oauth-proxy`** - Authentication
   - **Purpose**: OAuth flow handling, token management
   - **Runtime**: Node.js on AWS Lambda
   - **Framework**: Serverless functions

2. **`lambdas/stats-lambda`** - Statistics Processing
   - **Purpose**: Sports statistics calculations
   - **Runtime**: Node.js on AWS Lambda
   - **Data Sources**: External sports APIs

3. **`lambdas/game-selection`** - Game Logic
   - **Purpose**: Game selection algorithms
   - **Runtime**: Node.js on AWS Lambda

### **Infrastructure**

- **Cloud Provider**: AWS
- **Infrastructure as Code**: Terraform
- **Database**: RDS PostgreSQL
- **API Gateway**: AWS API Gateway
- **Authentication**: OAuth 2.0 + JWT

## 🔧 Development Environment Setup

### **Prerequisites**

```bash
# Required tools
node --version          # Node.js 18+ required
npm --version          # npm 8+ required
make --version         # GNU Make or compatible
git --version          # Git 2.20+ required

# Optional but recommended
poetry --version       # Python package manager
aws --version          # AWS CLI for deployments
```

### **Initial Setup**

```bash
# 1. Clone and setup
git clone <repo-url>
cd legacy-sports
make install           # Installs Node + Python dependencies

# 2. Verify setup
make typecheck         # Ensure TypeScript compiles
make lint             # Ensure code quality
make test:all         # Run all tests

# 3. Start development
make dev              # Starts all development services
```

### **Development Workflow**

```bash
# Daily workflow
git pull origin main           # Get latest changes
make install                  # Update dependencies
make dev                      # Start development servers

# Before committing
make lint:fix                 # Auto-fix linting issues
make typecheck               # Verify TypeScript
make test:changed            # Run tests for changed files
git add . && git commit      # Commit changes
```

### **Common Development Tasks**

```bash
# Code generation
make codegen                 # Generate GraphQL types, DB schema

# Mobile development
make android                 # Run Android emulator
make ios                    # Run iOS simulator
make build-android          # Build Android APK
make build-ios             # Build iOS IPA

# Web development
make dev:web               # Start web dev server
make build:web            # Build web for production

# Lambda development
make dev:lambdas          # Start local lambda servers
make deploy:lambda        # Deploy to AWS
```

## 🎯 Code Organization Standards

### **Import Organization**

```typescript
// 1. External libraries
import React from 'react';
import { useQuery } from '@apollo/client';

// 2. Internal libraries (lib/)
import { Button } from '@legacy-sports/shared-components';
import { useAuth } from '@legacy-sports/api';

// 3. Platform components (magic string system)
import { Platform, FlatList } from './platform-components';

// 4. Relative imports
import { PlayerCard } from './PlayerCard';
import type { PlayerData } from '../types';
```

### **File Naming Conventions**

```
components/
├── PlayerCard.tsx          # PascalCase for components
├── PlayerCard.test.tsx     # .test. for unit tests
├── PlayerCard.stories.tsx  # .stories. for Storybook
└── index.ts               # Barrel exports

utils/
├── formatDate.ts          # camelCase for utilities
├── api-helpers.ts         # kebab-case for multi-word
└── types.ts              # Shared type definitions

hooks/
├── usePlayer.ts          # camelCase starting with 'use'
├── usePlayerStats.ts     # Clear, descriptive names
└── index.ts             # Barrel exports
```

### **Testing Strategies**

- **Unit Tests**: Jest for business logic, utilities
- **Component Tests**: React Testing Library for UI components
- **Integration Tests**: Playwright for E2E workflows
- **Visual Tests**: Storybook for component visual regression
- **API Tests**: GraphQL schema validation, resolver tests

---

**Remember**: This codebase prioritizes cross-platform compatibility and type safety. When in doubt, ask for clarification rather than making assumptions that could break the platform abstraction system.
