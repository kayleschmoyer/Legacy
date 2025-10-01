/**
 * React Native specific platform components index
 *
 * This file bypasses the __PLATFORM_COMPONENTS__ magic string resolution
 * which can cause issues in Metro bundler CI environments.
 *
 * For React Native builds, we directly import mobile components.
 */

// Direct import of mobile platform components for React Native
import mobileComponents from './mobile/index';

// Re-export everything from mobile components
export * from './types';
export default mobileComponents;

// Destructure and export known components
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
  KeyboardAvoidingView,
  Picker,
  Platform,
  Vibration,

  // Platform-specific components
  Icon,
  Table,
} = mobileComponents;
