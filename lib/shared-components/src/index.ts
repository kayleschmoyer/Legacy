import './types/tamagui.d.ts';

export * from './Button';
export * from './IconButton';
export * from './Layout';
export * from './screens/DraftBoardScreen';

// New shared components
export * from './ConditionalProviders';
export * from './AppProvider';
export * from './components/HolographicCard';

// Cross-platform components from new structure (star export except Button)
export {
  // Platform-specific providers and utilities
  OAuthProvider,
  SecureStorageProvider,
  PlatformProviders,
  PlatformUtils,

  // Platform-specific components (using magic string system)
  Icon,
  Table,

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

// IconButton types
export type {
  IconButtonProps,
  IconButtonSize,
  IconButtonVariant,
  IconButtonColorScheme,
} from './types/IconButton.types';

// Export all shared components and types
export * from './config/sports';
// EraFilter enum and other common types
export { EraFilter } from './types/index';

// Stats components
export * from './features/stats/StatsTable';
export * from './features/stats/BattingStatsTable';
export * from './features/stats/PitchingStatsTable';

// League components
export * from './features/leagues/CreateLeagueModal';

// Draft components
export * from './features/draft/DraftBoard';
export * from './features/draft/ChatPanel';

// Season Draft Game
export * from './features/season-draft';

// Player components
export * from './features/players';

// Auth components
export * from './features/auth';

// Utils (keep backward compatibility)
export * from './utils/HookHelpers';
export * from './utils/DateUtilities';
export * from './utils/ErrorHandler';
export * from './utils/PositionModels';

// Platform-specific utilities (using Metro's .native.ts resolution)
export * from './utils/SecureStorage';

// Sports components
export * from './features/sports/SportHome';
export * from './features/sports/SportScreens';

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
export * from './components/DatePicker';
export * from './components/DateTimePicker';
export * from './components/ErrorBoundary';
export * from './components/AvatarImage';

// Cross-platform form controls
export * from './Dropdown';

// Team components
export * from './features/teams/TeamPicker';

// Baseball components
export * from './features/baseball/FilterOptions';
export * from './features/baseball/PlayersOverview';
export * from './features/baseball/MLBHome';

// Roster management
export * from './features/roster/rosterUtils';
export * from './features/roster/LineupEditor';
export * from './features/roster/MatchupRosterEditorView';

// Stats components (updated)
export * from './features/stats/FieldingStatsTable';
export * from './features/stats/UsefulTables';
export * from './features/stats/GameLogsTable';
export * from './features/stats/CareerStatsViewer';

// Navigation components
export * from './navigation';

// Enhanced components (final migration)
export * from './navigation/TamaguiAppNavigator';

// Real-time WebSocket hooks
export * from './hooks/useWebSocket';

// Tamagui config - should be imported directly by consumers
// export { tamaguiConfig } from '@legacy-sports/tamagui-config';

// Style utilities
export * from './utils/styles';

// Shared UI components (cross-platform)
export * from './components/StatusBadge';
export * from './components/EmptyState';
export * from './components/ErrorState';
export * from './components/PanelCard';
export * from './components/UnifiedLoadingPanel';

// Shared formatting utilities
export * from './utils/scoreFormatting';
export * from './utils/playerFormatting';
export * from './utils/draftStatus';

// Color constants and utilities
export * from './utils/colors';

// GraphQL-to-scoring stat mappers
export * from './utils/mapGraphQLToScoringFormat';

// Preset image data (avatars, team logos, banners)
export * from './constants/presets';

// League feature components
export * from './features/leagues/LeagueActivityFeed';
export * from './features/leagues/LeagueScoringSummary';
export * from './features/leagues/OnThisDayFeed';

// Commissioner tools
export * from './features/commissioner';

// Matchup feature components
export * from './features/matchup';

// Picker components (avatar, banner)
export * from './components/AvatarPicker';
export * from './components/BannerPicker';

// Heritage Line icon system
export * from './components/icons';

// Elite Draft Board (promoted from web)
export * from './features/elite-draft';
