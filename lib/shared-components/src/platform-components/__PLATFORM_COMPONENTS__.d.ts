/**
 * Platform Components Type Declarations
 *
 * This module provides type declarations for the '__PLATFORM_COMPONENTS__' magic string
 * that gets resolved at build time by Vite to the appropriate platform implementation.
 *
 * ⚠️  CRITICAL: This uses an interface-based contract pattern where:
 * 1. PlatformExports interface defines the contract all platforms must implement
 * 2. Magic string declares it implements this contract
 * 3. Platform implementations satisfy the interface at build time
 */

declare module '__PLATFORM_COMPONENTS__' {
  // Import the platform contract interface
  import type { PlatformExports } from './types/platform-exports';

  // Declare that the magic string exports an implementation of the contract
  const MODULE_EXPORTS: PlatformExports;
  export default MODULE_EXPORTS;

  // Re-export all shared types for convenience
  export * from './types/auth';
  export * from './types/animation';
  export * from './types/platform';
  export * from './types/react-native-props';
  export * from './types/platform-exports';
}
