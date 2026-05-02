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
// Common enums and types
export {
  EraFilter,
  type SportPosition,
  type TrendingDirection,
  type TrendingInfo,
  type PlayerStats,
  type Route,
  type NavigationConfig,
} from './types/index';

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

// Progressive Disclosure Minigame
export * from './features/disclosure-game';

// Minigames Hub
export * from './features/minigames-hub';
// 20 Questions Minigame
export * from './features/twenty-questions';

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
export * from './features/roster/MatchupRosterComparison';
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

// Scoreboard primitives (cross-platform)
export * from './components/scoreboard';

// Design-system primitives & composites (LS-4146 — Claude Design handoff).
// Explicit re-exports avoid name collisions with existing legacy exports
// (e.g. Layout's Separator, navigation's TabItem, features/matchup's
// MatchupCard / StandingsTable). Matchup-cluster components are NOT
// re-exported here — import them directly from `./components/<Name>`
// when consumers want the new design-system version.
export { Input, Textarea } from './components/Input';
export type { InputProps, InputSize, TextareaProps } from './components/Input';
export { Chip, PositionChip } from './components/Chip';
export type {
  ChipProps,
  ChipTone,
  Position as ChipPosition,
} from './components/Chip';
export {
  Switch,
  Checkbox,
  Radio,
  SegmentedControl,
} from './components/ToggleControls';
export type {
  SwitchProps,
  CheckboxProps,
  RadioProps,
  RadioOption,
  SegmentedControlProps,
  SegmentedOption,
} from './components/ToggleControls';
export { Spinner, Skeleton, SkeletonRow } from './components/Spinner';
export type { SpinnerProps, SkeletonProps } from './components/Spinner';
export { Dialog } from './components/Dialog';
export type { DialogProps } from './components/Dialog';
export { Sheet as DSSheet } from './components/Sheet';
export type { SheetProps as DSSheetProps } from './components/Sheet';
export { Popover } from './components/Popover';
export type { PopoverProps } from './components/Popover';
export { Tabs } from './components/Tabs';
export type { TabsProps, TabItem as TabsItem } from './components/Tabs';
export { Select } from './components/Select';
export type { SelectProps, SelectOption } from './components/Select';
export { LeagueCard } from './components/LeagueCard';
export type { LeagueCardProps } from './components/LeagueCard';
export { NotificationBell } from './components/NotificationBell';
export type {
  NotificationBellProps,
  NotificationItem,
} from './components/NotificationBell';
export { NavBar } from './components/NavBar';
export type { NavBarProps, NavLink } from './components/NavBar';

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

// Chat components
export * from './features/chat/GifPicker';

// League feature components
export * from './features/leagues/LeagueActivityFeed';
export * from './features/leagues/LeagueScoringSummary';
export * from './features/leagues/OnThisDayFeed';
export * from './features/leagues/TradingCenter';

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
