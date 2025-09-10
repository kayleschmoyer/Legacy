# Directory-Based Platform Component Organization

## Overview

Successfully reorganized the platform-specific components into a cleaner directory structure with single alias resolution, replacing the previous individual component aliases.

## New Structure

### Before (Individual Component Aliases)

```
// Multiple aliases for each component
__PLATFORM_ICONS__ → src/platform-components/web/Icons.tsx
__PLATFORM_TABLE__ → src/platform-components/web/Table.tsx
__PLATFORM_LOADING_PANEL__ → src/platform-components/LoadingPanel.web.tsx
```

### After (Directory-Based Alias)

```
// Single alias pointing to platform index
__PLATFORM_COMPONENTS__ → src/platform-components/web/index.ts
__PLATFORM_COMPONENTS__ → src/platform-components/mobile/index.ts
```

## Directory Organization

```
src/platform-components/
├── web/
│   ├── index.ts              # Exports all web components
│   ├── Icons.tsx
│   ├── Table.tsx
│   ├── LoadingPanel.tsx      # Moved from LoadingPanel.web.tsx
│   └── ReactNativeEquivalents.tsx
├── mobile/
│   ├── index.ts              # Exports all mobile components
│   ├── Icons.tsx
│   ├── Table.tsx
│   └── LoadingPanel.tsx      # Moved from LoadingPanel.mobile.tsx
└── wrappers/
    ├── LazyIcon.tsx          # Uses __PLATFORM_COMPONENTS__
    ├── LazyTable.tsx         # Uses __PLATFORM_COMPONENTS__
    └── LazyLoadingPanel.tsx  # Uses __PLATFORM_COMPONENTS__
```

## Platform Index Files

### Web Index (`src/platform-components/web/index.ts`)

```typescript
// Platform-specific web components
export { default as WebIcons } from './Icons';
export { default as WebTable } from './Table';
export { LoadingPanel } from './LoadingPanel';
export { default as ReactNativeEquivalents } from './ReactNativeEquivalents';

// Re-export for convenience
export * from './ReactNativeEquivalents';
```

### Mobile Index (`src/platform-components/mobile/index.ts`)

```typescript
// Platform-specific mobile components
export { default as MobileIcons } from './Icons';
export { default as MobileTable } from './Table';
export { LoadingPanel } from './LoadingPanel';
```

## Vite Configuration

### Shared Components (`lib/shared-components/vite.config.ts`)

```typescript
resolve: {
  alias: {
    // Single alias pointing to platform directory index
    __PLATFORM_COMPONENTS__: resolve(
      __dirname,
      `src/platform-components/${platform}/index.ts`
    ),
    // ... other aliases
  }
}
```

### Web App (`apps/web/vite.config.ts`)

```typescript
resolve: {
  alias: {
    // Single alias pointing to web platform directory index
    __PLATFORM_COMPONENTS__: resolve(
      __dirname,
      '../../lib/shared-components/src/platform-components/web/index.ts'
    ),
    // ... other aliases
  }
}
```

## Component Usage

### Lazy Components

```typescript
// LazyIcon.tsx
import * as PlatformComponents from '__PLATFORM_COMPONENTS__';

export const LazyIcon: React.FC<IconProps> = (props) => {
  const IconComponent = (PlatformComponents as any).WebIcons || (PlatformComponents as any).MobileIcons;
  return <IconComponent {...props} />;
};
```

## Benefits

1. **Simplified Configuration**: Single alias instead of multiple component-specific aliases
2. **Easier Maintenance**: Add new components by updating index files, no need to modify Vite configs
3. **Better Organization**: Components are properly grouped by platform in directories
4. **Cleaner Imports**: All platform components available through single import
5. **Scalable**: Easy to add new platform-specific components

## Build Results

✅ **Web Build**: Successfully builds with only web components (3.04 kB)
✅ **Web App**: Successfully builds and runs with platform-optimized components
✅ **Alias Resolution**: Single `__PLATFORM_COMPONENTS__` alias resolves correctly at build time
✅ **Tree Shaking**: Only platform-specific components included in final bundle

## TypeScript Support

Updated `platform-aliases.d.ts` to declare the unified module:

```typescript
declare module '__PLATFORM_COMPONENTS__' {
  // Web platform exports
  export const WebIcons: React.FC<IconProps>;
  export const WebTable: React.FC<TableProps>;
  export function LoadingPanel(): JSX.Element;

  // Mobile platform exports
  export const MobileIcons: React.FC<IconProps>;
  export const MobileTable: React.FC<TableProps>;

  // Platform-specific exports
  export const Text: React.FC<any>;
  export const View: React.FC<any>;
  // ... etc
}
```

This reorganization maintains all the build-time optimization benefits while providing a much cleaner and more maintainable structure for managing platform-specific components.
