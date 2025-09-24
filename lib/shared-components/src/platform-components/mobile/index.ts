// Platform-specific mobile components
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
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
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image: Image as unknown as React.ComponentType<Record<string, unknown>>,
  KeyboardAvoidingView: KeyboardAvoidingView as unknown as React.ComponentType<
    Record<string, unknown>
  >,
  Modal: Modal as unknown as React.ComponentType<Record<string, unknown>>,
  Picker: Picker as unknown as React.ComponentType<Record<string, unknown>>,
  Platform,
  Pressable: Pressable as unknown as React.ComponentType<
    Record<string, unknown>
  >,
  SafeAreaView: SafeAreaView as unknown as React.ComponentType<
    Record<string, unknown>
  >,
  StyleSheet,
  TouchableOpacity: TouchableOpacity as unknown as React.ComponentType<
    Record<string, unknown>
  >,
  Vibration,

  // ===== PLATFORM-SPECIFIC PROVIDERS =====
  PlatformProviders: MobileProviders,

  // ===== PLATFORM-SPECIFIC UTILITIES =====
  PlatformUtils: PlatformUtilsImport,

  // ===== PLATFORM-SPECIFIC COMPONENTS =====
  Icon: IconsComponent,
  Table: TableComponent as unknown as React.ComponentType<
    Record<string, unknown>
  >,
  SecureStorage: mobileSecureStorage,
});

// Export the entire validated module as a default export
export default MODULE_EXPORTS;
