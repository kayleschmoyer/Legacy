# Platform-Specific Components Architecture

This directory contains the restructured platform-specific component system for the shared-components library.

## Directory Structure

```
platform-components/
├── web/                    # Web-specific implementations
│   ├── Icons.tsx          # Web icon implementation (Unicode/CSS)
│   ├── Table.tsx          # Web table implementation (HTML table)
│   ├── ReactNativeEquivalents.tsx  # Web equivalents for RN components
│   └── index.ts           # Web exports
├── mobile/                 # Mobile/React Native implementations
│   ├── Icons.tsx          # Native icon implementation (Expo Vector Icons)
│   ├── Table.tsx          # Native table implementation (React Native)
│   └── index.ts           # Mobile exports
└── wrappers/               # Cross-platform wrapper components
    ├── LazyIcon.tsx       # Cross-platform icon wrapper
    ├── LazyTable.tsx      # Cross-platform table wrapper
    ├── PlatformUtils.tsx  # Platform detection utilities
    ├── SecureStorage.ts   # Cross-platform secure storage
    └── index.ts           # Wrapper exports
```

## Key Components

### Platform Detection (`PlatformUtils.tsx`)

- Provides runtime platform detection
- Offers cross-platform component wrapper (`CrossPlatformComponent`)
- Includes helper utilities for platform-specific logic

### Lazy Components

- **LazyIcon**: Automatically loads web or native icon implementation
- **LazyTable**: Automatically loads web or native table implementation
- Both use React's `Suspense` for lazy loading

### Secure Storage (`SecureStorage.ts`)

- Cross-platform secure storage abstraction
- Uses Expo SecureStore on mobile, sessionStorage on web
- Provides consistent API across platforms

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
