/**
 * Platform Components Abstraction Layer
 *
 * ⚠️  CRITICAL: DO NOT MODIFY THIS FILE WITHOUT UNDERSTANDING THE MAGIC STRING SYSTEM ⚠️
 *
 * This file serves as the ABSTRACTION LAYER between consumer code and platform-specific
 * implementations. It gets COMPLETELY REPLACED at build time by Vite based on the target platform.
 *
 * BUILD-TIME RESOLUTION:
 * - Web builds: Vite replaces '__PLATFORM_COMPONENTS__' → './web/index.ts'
 * - Mobile builds: Vite replaces '__PLATFORM_COMPONENTS__' → './mobile/index.ts'
 *
 * HOW IT WORKS:
 * 1. Developer imports: import { OAuthProvider } from 'platform-components'
 * 2. This file exports from: '__PLATFORM_COMPONENTS__' (magic string)
 * 3. Vite resolves magic string to correct platform at build time:
 *    - vite.config.mts defines: __PLATFORM_COMPONENTS__: `src/platform-components/${platform}/index.ts`
 * 4. Platform-specific index exports the implementation:
 *    - web/index.ts: export { webOAuthProvider as OAuthProvider }
 *    - mobile/index.ts: export { mobileOAuthProvider as OAuthProvider }
 * 5. Final bundle contains ONLY platform-specific code!
 *
 * DEVELOPER RULES:
 * ✅ DO: Add new shared types to ./types/ and export them here
 * ✅ DO: Add new platform implementations to web/index.ts and mobile/index.ts
 * ✅ DO: Export new implementations through '__PLATFORM_COMPONENTS__' below
 * ❌ DON'T: Import platform-specific files directly (breaks the abstraction)
 * ❌ DON'T: Use dynamic imports/requires (defeats build-time optimization)
 * ❌ DON'T: Add platform detection logic here (handled by build system)
 * ❌ DON'T: Replace the magic string exports with direct imports
 *
 * FUTURE AI ASSISTANT NOTES:
 * - This system optimizes bundles by including only platform-specific code
 * - The magic string '__PLATFORM_COMPONENTS__' is NOT a runtime import
 * - TypeScript types are declared in __PLATFORM_COMPONENTS__.d.ts
 * - Any changes here must be mirrored in both web/index.ts and mobile/index.ts
 * - Test changes by building for both platforms and verifying bundle contents
 */

// Import platform-specific module exports
// eslint-disable-next-line @nx/enforce-module-boundaries
import platformComponents from '__PLATFORM_COMPONENTS__';
import type { PlatformExports } from './types/platform-exports';

// Export shared types (available on all platforms)
export * from './types';

// Platform-specific implementations (resolved at build time)
// Destructure and export known components from the platform-specific module
// TypeScript now knows platformComponents conforms to PlatformExports interface
export const {
  // Platform-specific providers and utilities
  OAuthProvider,
  SecureStorageProvider,
  PlatformProviders,
  PlatformUtils,

  // React Native equivalents (excluding Button to avoid conflict)
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Picker,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,

  // Platform-specific components
  Icon,
  Table,
  SecureStorage,
} = platformComponents as PlatformExports;
