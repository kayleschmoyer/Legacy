// Global Jest setup for React Native components
import '@testing-library/jest-dom';
import 'react-native-gesture-handler/jestSetup';

// Define __DEV__ global for React Native components
global.__DEV__ = true;

// Mock window.matchMedia for Tamagui (must be before any tamagui imports)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock React Native components
jest.mock('react-native', () => ({
  // Basic components
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  ActivityIndicator: 'ActivityIndicator',
  SafeAreaView: 'SafeAreaView',
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios || obj.default,
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
  },

  // Mock Animated API
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => ({ __getValue: () => 0 })),
      setValue: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      __getValue: () => 0,
    })),
    timing: jest.fn(() => ({
      start: jest.fn((callback) => callback && callback({ finished: true })),
    })),
    spring: jest.fn(() => ({
      start: jest.fn((callback) => callback && callback({ finished: true })),
    })),
    loop: jest.fn(() => ({
      start: jest.fn(),
    })),
    sequence: jest.fn(() => ({
      start: jest.fn(),
    })),
    parallel: jest.fn(() => ({
      start: jest.fn(),
    })),
    View: 'Animated.View',
    Text: 'Animated.Text',
    ScrollView: 'Animated.ScrollView',
    createAnimatedComponent: (Component) => Component,
  },

  Vibration: {
    vibrate: jest.fn(),
  },

  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 667 })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },

  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios || obj.default),
  },

  StatusBar: {
    setBarStyle: jest.fn(),
    setBackgroundColor: jest.fn(),
  },
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable',
  DrawerLayout: 'DrawerLayout',
  State: {},
  ScrollView: 'ScrollView',
  Slider: 'Slider',
  Switch: 'Switch',
  TextInput: 'TextInput',
  ToolbarAndroid: 'ToolbarAndroid',
  ViewPagerAndroid: 'ViewPagerAndroid',
  DrawerLayoutAndroid: 'DrawerLayoutAndroid',
  WebView: 'WebView',
  NativeViewGestureHandler: 'NativeViewGestureHandler',
  TapGestureHandler: 'TapGestureHandler',
  FlingGestureHandler: 'FlingGestureHandler',
  ForceTouchGestureHandler: 'ForceTouchGestureHandler',
  LongPressGestureHandler: 'LongPressGestureHandler',
  PanGestureHandler: 'PanGestureHandler',
  PinchGestureHandler: 'PinchGestureHandler',
  RotationGestureHandler: 'RotationGestureHandler',
  RawButton: 'RawButton',
  BaseButton: 'BaseButton',
  RectButton: 'RectButton',
  BorderlessButton: 'BorderlessButton',
  FlatList: 'FlatList',
  gestureHandlerRootHOC: jest.fn((component) => component),
  Directions: {},
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock Expo modules if present
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  FontAwesome: 'FontAwesome',
  AntDesign: 'AntDesign',
  Feather: 'Feather',
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => ({
  Svg: 'Svg',
  Circle: 'Circle',
  Ellipse: 'Ellipse',
  G: 'G',
  Text: 'Text',
  TSpan: 'TSpan',
  TextPath: 'TextPath',
  Path: 'Path',
  Polygon: 'Polygon',
  Polyline: 'Polyline',
  Line: 'Line',
  Rect: 'Rect',
  Use: 'Use',
  Image: 'Image',
  Symbol: 'Symbol',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  RadialGradient: 'RadialGradient',
  Stop: 'Stop',
  ClipPath: 'ClipPath',
  Pattern: 'Pattern',
  Mask: 'Mask',
  Marker: 'Marker',
  ForeignObject: 'ForeignObject',
  // Mock Touchable to fix SVG icon issues
  Touchable: {
    Mixin: {},
  },
}));

// Mock Tamagui components for web testing
jest.mock('tamagui', () => ({
  TamaguiProvider: ({ children }) => children,
  useTheme: () => ({
    background: 'white',
    color: 'black',
    borderColor: 'gray',
    backgroundColor: 'white',
  }),
  YStack: ({ children, ...props }) => <div {...props}>{children}</div>,
  XStack: ({ children, ...props }) => <div {...props}>{children}</div>,
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  Input: ({ ...props }) => <input {...props} />,
  Select: Object.assign(
    ({ children, ...props }) => <select {...props}>{children}</select>,
    {
      Trigger: ({ children, ...props }) => <div {...props}>{children}</div>,
      Value: ({ children, ...props }) => <div {...props}>{children}</div>,
      Icon: ({ children, ...props }) => <div {...props}>{children}</div>,
      Adapt: ({ children, ...props }) => <div {...props}>{children}</div>,
      Content: ({ children, ...props }) => <div {...props}>{children}</div>,
      ScrollUpButton: ({ children, ...props }) => (
        <div {...props}>{children}</div>
      ),
      ScrollDownButton: ({ children, ...props }) => (
        <div {...props}>{children}</div>
      ),
      Viewport: ({ children, ...props }) => <div {...props}>{children}</div>,
      Item: ({ children, ...props }) => <div {...props}>{children}</div>,
      ItemText: ({ children, ...props }) => <div {...props}>{children}</div>,
      ItemIndicator: ({ children, ...props }) => (
        <div {...props}>{children}</div>
      ),
    },
  ),
  Sheet: Object.assign(
    ({ children, ...props }) => <div {...props}>{children}</div>,
    {
      Frame: ({ children, ...props }) => <div {...props}>{children}</div>,
      ScrollView: ({ children, ...props }) => <div {...props}>{children}</div>,
    },
  ),
  ScrollView: ({ children, ...props }) => <div {...props}>{children}</div>,
  Text: ({ children, ...props }) => <div {...props}>{children}</div>,
  H1: ({ children, ...props }) => <h1 {...props}>{children}</h1>,
  H2: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
  H3: ({ children, ...props }) => <h3 {...props}>{children}</h3>,
  Paragraph: ({ children, ...props }) => <p {...props}>{children}</p>,
  Spinner: ({ ...props }) => <div {...props}>Loading...</div>,
  Separator: ({ ...props }) => <hr {...props} />,
  // Mock theme context
  useThemeState: () => ({ theme: 'light' }),
  createTheme: () => ({}),
}));

// Mock Lucide icons from @tamagui/lucide-icons
jest.mock('@tamagui/lucide-icons', () => ({
  ArrowUpDown: ({ ...props }) => <div {...props}>↕</div>,
  ChevronDown: ({ ...props }) => <div {...props}>⌄</div>,
  RefreshCw: ({ ...props }) => <div {...props}>↻</div>,
  Search: ({ ...props }) => <div {...props}>🔍</div>,
}));

// Mock React Native Google Sign-In
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        user: { email: 'test@example.com', id: 'test-id' },
        idToken: 'test-token',
      }),
    ),
    signOut: jest.fn(() => Promise.resolve()),
    isSignedIn: jest.fn(() => Promise.resolve(false)),
    getCurrentUser: jest.fn(() => Promise.resolve(null)),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 12501,
    IN_PROGRESS: 12502,
    PLAY_SERVICES_NOT_AVAILABLE: 12500,
  },
}));
