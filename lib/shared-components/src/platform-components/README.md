# Platform-Specific Components Architecture

This directory contains the **magic string system** portion of the hybrid platform resolution architecture. This system is used for **complex UI components** that require build-time optimization and strong type contracts.

> **📚 For complete architecture overview**: See [Hybrid Platform Resolution Guide](../../../../docs/HYBRID_PLATFORM_RESOLUTION_GUIDE.md)

## 🎯 Magic String System (This Directory)

**Used for**: Icons, Tables, OAuth Providers, Complex React Components  
**Benefits**: Build-time optimization, strong type contracts, dead code elimination

## Directory Structure

```
platform-components/
├── web/                    # Web-specific implementations
│   ├── Icons.tsx          # Web icon implementation (Unicode/CSS)
│   ├── Table.tsx          # Web table implementation (HTML table)
│   ├── WebOAuthProvider.tsx # Web OAuth provider
│   ├── ReactNativeEquivalents.tsx  # Web equivalents for RN components
│   └── index.ts           # Web exports
├── mobile/                 # Mobile/React Native implementations
│   ├── Icons.tsx          # Native icon implementation (Expo Vector Icons)
│   ├── Table.tsx          # Native table implementation (React Native)
│   ├── MobileOAuthProvider.tsx # Mobile OAuth provider
│   └── index.ts           # Mobile exports
├── types/                  # Shared TypeScript interfaces
│   ├── platform-exports.ts # Platform contract definitions
│   ├── auth.ts            # OAuth and authentication types
│   └── index.ts           # Type exports
└── index.ts               # Magic string resolution entry point
```

## 🚀 Build-Time Resolution

The magic string `__PLATFORM_COMPONENTS__` gets replaced at build time:

- **Web builds**: `__PLATFORM_COMPONENTS__` → `platform-components/web/index.ts`
- **Mobile builds**: `__PLATFORM_COMPONENTS__` → `platform-components/mobile/index.ts`
- **Result**: Only platform-specific code gets bundled!

## Key Components

### ✅ **Components in Magic String System**

#### Icons (`Icons.tsx`)

- **Web**: Unicode/CSS icons
- **Mobile**: Expo Vector Icons with fallbacks
- **Usage**: `<Icon name="search" size={24} />`

#### Tables (`Table.tsx`)

- **Web**: HTML table elements
- **Mobile**: React Native table components
- **Usage**: `<Table headers={headers} data={data} />`

#### OAuth Providers (`WebOAuthProvider.tsx` / `MobileOAuthProvider.tsx`)

- **Web**: Google OAuth web integration
- **Mobile**: Expo AuthSession integration
- **Usage**: `OAuthProvider.signIn()`

#### Platform Utilities (`PlatformUtils.tsx`)

- Runtime platform detection utilities
- Cross-platform helper functions
- Component wrappers for platform-specific logic

### ❌ **Components NOT in Magic String System**

#### SecureStorage (**Moved to Metro Native Resolution**)

- **New Location**: `lib/shared-components/src/utils/SecureStorage{.native}.ts`
- **Reason**: Simple utility, better suited for Metro's `.native.ts` resolution
- **Usage**: `import { SecureStorage } from '@legacy-sports/shared-components'`

## Usage

### Import from Wrappers (Recommended)

```typescript
import {
  LazyIcon,
  LazyTable,
  PlatformUtils,
  SecureStorage,
} from '@legacy-sports/shared-components';
```

### Platform-Specific Imports (Advanced)

```typescript
// Web-specific
import {
  WebIcons,
  WebTable,
  ReactNativeEquivalents,
} from '@legacy-sports/shared-components/platform-components/web';

// Mobile-specific
import {
  MobileIcons,
  MobileTable,
} from '@legacy-sports/shared-components/platform-components/mobile';
```

### Platform Detection

```typescript
import { PlatformUtils } from '@legacy-sports/shared-components';

if (PlatformUtils.isWeb) {
  // Web-specific code
} else if (PlatformUtils.isMobile) {
  // Mobile-specific code
}
```

## Migration Guide

### Old Import Pattern

```typescript
// ❌ Old way
import { LazyIcon } from '@legacy-sports/shared-components/components/LazyIcon';
import { PlatformUtils } from '@legacy-sports/shared-components/utils/PlatformUtils';
```

### New Import Pattern

```typescript
// ✅ New way
import { LazyIcon, PlatformUtils } from '@legacy-sports/shared-components';
```

## Benefits

1. **Clear Separation**: Platform-specific code is clearly separated
2. **Lazy Loading**: Components are loaded only when needed
3. **Type Safety**: Full TypeScript support across all platforms
4. **Backward Compatibility**: Main exports are preserved for existing code
5. **Scalability**: Easy to add new platform-specific implementations

## Adding New Components

1. Create web implementation in `web/YourComponent.tsx`
2. Create mobile implementation in `mobile/YourComponent.tsx`
3. Create wrapper in `wrappers/LazyYourComponent.tsx`
4. Export from appropriate index files
5. Add to main shared-components exports

## Build Considerations

- Vite automatically handles lazy loading and code splitting
- Platform-specific bundles only include relevant implementations
- Tree shaking eliminates unused platform code
