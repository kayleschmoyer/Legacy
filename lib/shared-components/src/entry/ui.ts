// Feature entry point: ui
// Import from this entry point for cross-platform UI primitives and common components.
// Usage: import { Button, XStack } from '@legacy-sports/shared-components/ui'
export * from '../Button';
export * from '../IconButton';
export * from '../Layout';
export * from '../Dropdown';
export * from '../AppProvider';
export * from '../ConditionalProviders';
export * from '../components/HolographicCard';
export * from '../components/DatePicker';
export * from '../components/DateTimePicker';
export * from '../components/ErrorBoundary';
export * from '../components/AvatarImage';
export * from '../components/AvatarPicker';
export * from '../components/BannerPicker';
export * from '../components/StatusBadge';
export * from '../components/EmptyState';
export * from '../components/ErrorState';
export * from '../components/PanelCard';
export * from '../components/UnifiedLoadingPanel';
// Design-system MatchupCard (LS-4719). Not re-exported from the root barrel
// (which prioritizes the features/matchup MatchupCard of the same name for
// raw-fragment consumers) or from `./matchup` (same collision) — this is its
// only public export path today.
export * from '../components/MatchupCard';
export * from '../components/Table';
export * from '../features/common/SearchBar';
export * from '../hooks/useThemeTokens';
export {
  OAuthProvider,
  SecureStorageProvider,
  PlatformProviders,
  PlatformUtils,
  Icon,
  FlatList,
  Alert,
  Picker,
  ActivityIndicator,
  KeyboardAvoidingView,
  Dimensions,
  Platform,
  Vibration,
  Animated,
} from '../platform-components';
export { OAuthErrorCode } from '../platform-components/types';
