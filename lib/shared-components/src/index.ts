import './types/tamagui.d.ts';

export * from './Button';
export * from './Layout';
export * from './screens/SportsScreens';
export * from './screens/DraftBoardScreen';

// New shared components
export * from './ConditionalProviders';
export * from './AppProvider';
// export * from './AppNavigator'; // Commented out due to parsing issues

// Cross-platform components from new structure (star export except Button)
export {
  // Platform-specific providers and utilities
  OAuthProvider,
  SecureStorageProvider,
  PlatformProviders,
  PlatformUtils,
  // React Native equivalents (excluding components with Tamagui equivalents)
  FlatList,
  Alert,
  Picker,
  ActivityIndicator,
  KeyboardAvoidingView,
  Dimensions,
  Platform,
  Vibration,
  Animated,
} from './platform-components';

// Import types separately from types directory
export type {
  OAuthConfig,
  OAuthResponse,
  OAuthError,
  OAuthErrorCode,
  ISecureStorage,
} from './platform-components/types';

// Export all shared components and types
export * from './config/sports';

// Stats components
export * from './features/stats/StatsTable';
export * from './features/stats/BattingStatsTable';
export * from './features/stats/PitchingStatsTable';

// League components
export * from './features/leagues/CreateLeagueModal';

// Draft components
export * from './features/draft/DraftBoard';

// Player components
export * from './features/players';

// Auth components
export * from './features/auth';

// Utils (keep backward compatibility)
export * from './utils/HookHelpers';
export * from './utils/DateUtilities';
export * from './utils/ErrorHandler';
export * from './utils/PositionModels';

// Sports components
export * from './features/sports/SportHome';

// Home components
export * from './features/home/HomeScreen';

// Player components
export * from './features/players/PlayerRow';
export * from './features/players/PlayerDetail';
export * from './features/players/PlayersApi';
export * from './features/players/PlayerCard';
export * from './features/players/PlayersGrid';
export * from './features/players/PlayersScreen';

// Common UI components
export * from './features/common/SearchBar';

// Team components
export * from './features/teams/TeamPicker';

// Baseball components
export * from './features/baseball/FilterOptions';
export * from './features/baseball/PlayersOverview';
export * from './features/baseball/MLBHome';

// Roster management
export * from './features/roster/LineupEditor';

// Stats components (updated)
export * from './features/stats/FieldingStatsTable';
export * from './features/stats/UsefulTables';
export * from './features/stats/GameLogsTable';
export * from './features/stats/CareerStatsViewer';

// Navigation components
export * from './navigation';

// Enhanced components (final migration)
export * from './navigation/TamaguiAppNavigator';

// Tamagui config - should be imported directly by consumers
// export { tamaguiConfig } from '@legacy-sports/tamagui-config';

// Style utilities
export * from './utils/styles';
