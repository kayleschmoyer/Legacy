// Platform-specific mobile components
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Vibration,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { mobileOAuthProvider } from './MobileOAuthProvider';
import { mobileSecureStorage } from './MobileSecureStorage';
import { MobileProviders } from './MobileProviders';
import * as PlatformUtilsImport from './PlatformUtils';
import IconsComponent from './Icons';
import TableComponent from './Table';
import { validatePlatformExports } from '../types/platform-exports';

// Export shared types (identical across all platforms)
export * from '../types';

// Create and validate the module exports object using our utility function
const MODULE_EXPORTS = validatePlatformExports({
  // ===== PLATFORM-SPECIFIC IMPLEMENTATIONS =====
  OAuthProvider: mobileOAuthProvider,
  SecureStorageProvider: mobileSecureStorage,

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
  PlatformProviders: MobileProviders,

  // ===== PLATFORM-SPECIFIC UTILITIES =====
  PlatformUtils: PlatformUtilsImport as unknown as {
    handleOAuthError?: (error: unknown) => void;
    createAuthHandlers?: () => Record<string, string>;
    getInteractiveButtonProps?: (disabled: boolean) => Record<string, unknown>;
    isWeb?: boolean;
    isNative?: boolean;
    OS?: string;
    select?: <T>(specifics: Record<string, T | undefined>) => T | undefined;
    [key: string]: unknown;
  },

  // ===== PLATFORM-SPECIFIC COMPONENTS =====
  Icon: IconsComponent,
  Table: TableComponent as unknown as React.ComponentType<
    Record<string, unknown>
  >,
  SecureStorage: mobileSecureStorage,
});

// Export the entire validated module as a default export
export default MODULE_EXPORTS;
