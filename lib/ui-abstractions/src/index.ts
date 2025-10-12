// Export all UI component types
export * from './types/ui';

// Export core UI components
export * from './components/Text';
export * from './components/Layout';
export * from './components/Button';
export * from './components/Input';
export * from './components/ScrollView';
export * from './components/Utils';

// Export theme provider and utilities
export * from './providers/UIThemeProvider';

// Export commonly used component combinations
export {
  // Text components
  Text,
  H1,
  H2, 
  H3,
  H4,
  H5,
  H6,
  Paragraph,
  Label,
  Caption,
} from './components/Text';

export {
  // Layout components
  View,
  XStack,
  YStack,
  ZStack,
  Card,
  Container,
} from './components/Layout';

export {
  // Button components
  Button,
  PrimaryButton,
  SecondaryButton,
  OutlineButton,
  GhostButton,
  LinkButton,
} from './components/Button';

export {
  // Input components
  Input,
  TextArea,
  PasswordInput,
  EmailInput,
  PhoneInput,
  NumberInput,
} from './components/Input';

export {
  // ScrollView components
  ScrollView,
  HorizontalScrollView,
  VerticalScrollView,
} from './components/ScrollView';

export {
  // Utility components
  Spinner,
  LoadingPanel,
  Separator,
  Divider,
  ActivityIndicator,
} from './components/Utils';

export {
  // Theme provider and hooks
  UIThemeProvider,
  useUITheme,
  useTamaguiTokens,
  createStyles,
  Themed,
} from './providers/UIThemeProvider';
