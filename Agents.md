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

## 🆘 Common Pitfalls

1. **Breaking Platform Abstraction** - Importing platform-specific files directly
2. **Type Shortcuts** - Using `any` instead of proper interfaces
3. **ESLint Avoidance** - Disabling rules instead of fixing root causes
4. **Build Assumptions** - Not testing changes on both web and mobile platforms
5. **Magic String Confusion** - Not understanding how `__PLATFORM_COMPONENTS__` works

---

**Remember**: This codebase prioritizes cross-platform compatibility and type safety. When in doubt, ask for clarification rather than making assumptions that could break the platform abstraction system.
