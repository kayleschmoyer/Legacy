// Platform-specific web components
export { default as WebIcons } from './Icons';
export { default as WebTable } from './Table';
export { LoadingPanel } from './LoadingPanel';
export { SecureStorage } from './SecureStorage';

// Initialize global StyleSheet for web platform (imports ReactNativeEquivalents)
import './ReactNativeEquivalents';

// Re-export all React Native equivalents for web
export * from './ReactNativeEquivalents';

// Direct exports with common names for build-time resolution
export { default as Icon } from './Icons';
export { default as Table } from './Table';
