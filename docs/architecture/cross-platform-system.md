# Hybrid Platform Resolution Architecture

## Overview

The Legacy Sports codebase uses a **hybrid approach** for platform-specific code resolution, combining the benefits of both **Magic String System** (for complex UI components) and **Metro's Native Resolution** (for simple utilities).

## Architecture Decision

### ✅ **Magic String System** - For Complex UI Components

- **Used for**: Icons, Tables, OAuth Providers, Complex React Components
- **Benefits**: Build-time optimization, strong type contracts, single source of truth
- **Implementation**: Vite alias resolution with `__PLATFORM_COMPONENTS__` magic string

### ✅ **Metro Native Resolution** - For Simple Utilities

- **Used for**: DbOptions, AwsSecrets, SecureStorage, Configuration files
- **Benefits**: Native Metro support, simple developer experience, CI reliability
- **Implementation**: `.native.ts` file extension pattern

## File Resolution Patterns

### Magic String System (Complex Components)

```
lib/shared-components/src/platform-components/
├── web/
│   ├── Icons.tsx           # Web icon implementation
│   ├── Table.tsx           # Web table component
│   └── WebOAuthProvider.tsx # Web OAuth provider
├── mobile/
│   ├── Icons.tsx           # Mobile icon implementation
│   ├── Table.tsx           # Mobile table component
│   └── MobileOAuthProvider.tsx # Mobile OAuth provider
└── index.ts                # Magic string resolution: '__PLATFORM_COMPONENTS__'
```

**Build-time Resolution:**

- **Web builds**: `__PLATFORM_COMPONENTS__` → `platform-components/web/index.ts`
- **Mobile builds**: `__PLATFORM_COMPONENTS__` → `platform-components/mobile/index.ts`

### Metro Native Resolution (Simple Utilities)

```
lib/utils/src/lib/
├── DbOptions.ts            # Web/server version (with Node.js)
├── DbOptions.native.ts     # Mobile version (environment variables only)
├── AwsSecrets.ts           # Web/server version (with AWS SDK)
└── AwsSecrets.native.ts    # Mobile version (fallbacks)

lib/shared-components/src/utils/
├── SecureStorage.ts        # Web version (sessionStorage)
└── SecureStorage.native.ts # Mobile version (Expo SecureStore)
```

**Metro Resolution:**

- **React Native builds**: Automatically prefers `.native.ts` over `.ts`
- **Web builds**: Uses standard `.ts` files
- **No configuration needed** - Metro handles this automatically

## Implementation Guidelines

### ✅ **Use Magic String System When:**

- Complex React components with platform-specific implementations
- Components that need strong TypeScript interface contracts
- UI elements that require build-time dead code elimination
- Components with heavy platform-specific dependencies

**Examples:**

```typescript
// Consumer code
import { Icon, Table, OAuthProvider } from '@legacy-sports/shared-components';

// Resolved at build time to platform-specific implementations
<Icon name="search" size={24} />
<Table headers={headers} data={data} />
```

### ✅ **Use Metro Native Resolution When:**

- Simple utility functions
- Configuration objects
- Platform-specific APIs that don't need UI components
- Internal implementation details

**Examples:**

```typescript
// Consumer code - same import, Metro resolves automatically
import { DbOptions, AwsSecrets, SecureStorage } from '@legacy-sports/utils';

// Metro automatically picks .native.ts on React Native
const options = getDbOptions();
await SecureStorage.setItem('key', 'value');
```

## Benefits of Hybrid Approach

### **Reliability**

- ✅ **Magic strings** provide build-time guarantees for complex components
- ✅ **Native resolution** eliminates CI alias resolution issues for utilities

### **Developer Experience**

- ✅ **Complex components** get explicit contracts and type safety
- ✅ **Simple utilities** work out-of-the-box with Metro's built-in resolution

### **Bundle Optimization**

- ✅ **Magic strings** enable perfect dead code elimination for UI components
- ✅ **Native resolution** naturally excludes platform-inappropriate code

### **Maintainability**

- ✅ **Architecture is explicit** about what requires platform abstraction
- ✅ **Simple utilities** don't need complex build configuration

## Migration Path

When adding new platform-specific code, choose the appropriate pattern:

### **Choose Magic String System:**

```typescript
// ✅ Complex UI component with multiple platform differences
export interface TableProps {
  headers: string[];
  data: (string | number)[][];
  onRowClick?: (row: number) => void;
}

// Needs strong contract across platforms
export const Table: React.ComponentType<TableProps>;
```

### **Choose Native Resolution:**

```typescript
// ✅ Simple utility with platform differences
export interface DbOptions {
  type: 'pg-local' | 'pg-remote';
  dbCertPath?: string;
}

// Implementation details, not UI contracts
export function getDbOptions(): DbOptions;
```

## File Naming Conventions

### Magic String System:

- `platform-components/web/ComponentName.tsx`
- `platform-components/mobile/ComponentName.tsx`
- `platform-components/index.ts` (magic string resolution)

### Metro Native Resolution:

- `utilities/UtilityName.ts` (web/server version)
- `utilities/UtilityName.native.ts` (mobile version)

## Type Safety

Both systems maintain full TypeScript support:

### Magic String System Types:

```typescript
// Declared in platform-components/__PLATFORM_COMPONENTS__.d.ts
declare module '__PLATFORM_COMPONENTS__' {
  const MODULE_EXPORTS: PlatformExports;
  export default MODULE_EXPORTS;
}
```

### Native Resolution Types:

```typescript
// Same interface across both .ts and .native.ts files
export interface SecureStorage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
}
```

## Testing Strategy

### Magic String System:

```typescript
// Mock the magic string for tests
jest.mock('__PLATFORM_COMPONENTS__', () => ({
  Icon: ({ name }: { name: string }) => `<Icon name="${name}" />`,
  Table: ({ headers }: { headers: string[] }) =>
    `<Table headers="${headers.join(',')}" />`,
}));
```

### Native Resolution:

```typescript
// Jest automatically uses .ts files in Node.js test environment
// No special mocking needed - Node.js resolution picks .ts over .native.ts
```

## Summary

The hybrid approach provides the **best of both worlds**:

- **Complex UI components** get build-time optimization and strong contracts via magic strings
- **Simple utilities** get Metro's reliable native resolution without configuration complexity
- **Developers** have clear guidelines on which pattern to use for new code
- **CI systems** are more reliable with less build-time alias configuration

This architecture scales well and provides clear separation of concerns between UI components that need explicit platform contracts and utilities that can use Metro's built-in resolution.
