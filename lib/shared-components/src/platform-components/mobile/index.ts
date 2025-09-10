// Platform-specific mobile components
export { default as MobileIcons } from './Icons';
export { default as MobileTable } from './Table';
export { LoadingPanel } from './LoadingPanel';
export { SecureStorage } from './SecureStorage';

// Re-export React Native components for mobile platform
export {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Platform,
  Dimensions,
  FlatList,
  Modal,
  Animated,
  Alert,
  SafeAreaView,
  Button,
  Image,
  Pressable,
  Vibration,
  KeyboardAvoidingView,
} from 'react-native';

// Re-export React Native Picker for mobile
export { Picker } from '@react-native-picker/picker';

// Direct exports with common names for build-time resolution
export { default as Icon } from './Icons';
export { default as Table } from './Table';
