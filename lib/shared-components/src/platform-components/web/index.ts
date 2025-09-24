// Platform-specific web components
import { webOAuthProvider } from './WebOAuthProvider';
import { webSecureStorage } from './WebSecureStorage';
import IconsComponent from './Icons';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Picker,
  Platform,
  PlatformProviders,
  PlatformUtils,
  Table,
  Vibration,
} from './ReactNativeEquivalents';
import { validatePlatformExports } from '../types/platform-exports';

// Export shared types (identical across all platforms)
export * from '../types';

// Create and validate the module exports object using our utility function
const MODULE_EXPORTS = validatePlatformExports({
  // ===== PLATFORM-SPECIFIC IMPLEMENTATIONS =====
  OAuthProvider: webOAuthProvider,
  SecureStorageProvider: webSecureStorage,

  // ===== REACT NATIVE COMPONENTS (NO TAMAGUI EQUIVALENT) =====
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Picker,
  Platform,
  Vibration,

  // ===== PLATFORM-SPECIFIC PROVIDERS =====
  PlatformProviders,

  // ===== PLATFORM-SPECIFIC UTILITIES =====
  PlatformUtils: PlatformUtils,

  // ===== PLATFORM-SPECIFIC COMPONENTS =====
  Icon: IconsComponent,
  Table,
  SecureStorage: webSecureStorage,
});

// Export the entire validated module as a default export
export default MODULE_EXPORTS;
