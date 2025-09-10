/// <reference path="./platform-aliases.d.ts" />

// Direct imports from platform components (no wrapper needed)
export {
  Icon,
  Table,
  LoadingPanel,
  SecureStorage,
} from '__PLATFORM_COMPONENTS__';

// Re-export React Native equivalents for web
export * from '__PLATFORM_COMPONENTS__';

// Type definitions (we can infer these from the platform components)
export type { IconProps } from './platform-components/wrappers/LazyIcon';
export type { TableProps } from './platform-components/wrappers/LazyTable';
