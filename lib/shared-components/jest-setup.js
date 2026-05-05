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

// Console suppression — only suppress noise that cannot be fixed at the source.
// Prop-leakage warnings are fixed in the mocks below.
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = (...args) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('validateDOMNesting') ||
        args[0].includes('not wrapped in act'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillReceiveProps') ||
        args[0].includes('addTypename') ||
        args[0].includes('go.apollo.dev'))
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
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
  return {
    default: {
      call: jest.fn(),
      createAnimatedComponent: (component) => component,
      addWhitelistedUIProps: jest.fn(),
      addWhitelistedNativeProps: jest.fn(),
    },
    useSharedValue: jest.fn((init) => ({ value: init })),
    useAnimatedStyle: jest.fn(() => ({})),
    useDerivedValue: jest.fn((fn) => ({ value: fn() })),
    useAnimatedScrollHandler: jest.fn(),
    withTiming: jest.fn((value) => value),
    withSpring: jest.fn((value) => value),
    withDecay: jest.fn((value) => value),
    withDelay: jest.fn((_, anim) => anim),
    withSequence: jest.fn((...anims) => anims[0]),
    withRepeat: jest.fn((anim) => anim),
    cancelAnimation: jest.fn(),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      in: jest.fn(),
      out: jest.fn(),
      inOut: jest.fn(),
    },
    FadeIn: { duration: jest.fn().mockReturnThis() },
    FadeOut: { duration: jest.fn().mockReturnThis() },
    Layout: { duration: jest.fn().mockReturnThis() },
    SlideInRight: { duration: jest.fn().mockReturnThis() },
    SlideOutLeft: { duration: jest.fn().mockReturnThis() },
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
  };
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
jest.mock('tamagui', () => {
  const React = require('react');

  const NON_DOM = new Set([
    'onPress',
    'onPressIn',
    'onPressOut',
    'onSubmitEditing',
    'onValueChange',
    'onOpenChange',
    'accessibilityLabel',
    'accessibilityRole',
    'accessibilityState',
    'accessibilityHint',
    'accessibilityValue',
    'testID',
    'numberOfLines',
    'ellipsizeMode',
    'selectable',
    'adjustsFontSizeToFit',
    'allowFontScaling',
    'minimumFontScale',
    'hitSlop',
    'pressRetentionOffset',
    'keyboardType',
    'textTransform',
    'horizontal',
    'backgroundColor',
    'borderRadius',
    'borderColor',
    'borderWidth',
    'paddingHorizontal',
    'paddingVertical',
    'marginHorizontal',
    'marginVertical',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
    'unstyled',
    'pressStyle',
    'hoverStyle',
    'focusStyle',
    'enterStyle',
    'exitStyle',
    'animation',
    'animateOnly',
    'themeInverse',
    'elevate',
    'bordered',
    'circular',
    'chromeless',
    'size',
    'scaleIcon',
    'scaleSpace',
    'spaceFlex',
    'debug',
    'componentName',
    'tag',
    'disableOptimization',
    'forceStyle',
    'asChild',
    'space',
    'separator',
    'active',
    'showsHorizontalScrollIndicator',
    'showsVerticalScrollIndicator',
    'snapPointsMode',
    'contentContainerStyle',
    'pointerEvents',
    'maxWidth',
    'minWidth',
    'maxHeight',
    'minHeight',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'gap',
    'flex',
    'flexDirection',
    'alignItems',
    'justifyContent',
    'overflow',
    'opacity',
    'fontWeight',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'color',
    'fontFamily',
    'width',
    'height',
    'top',
    'left',
    'right',
    'bottom',
    'display',
    'textAlign',
    'whiteSpace',
    'wordBreak',
    'textOverflow',
    'padding',
    'margin',
    'position',
    'zIndex',
    'cursor',
    'modal',
    'open',
    'snapPoints',
    'dismissOnSnapToBottom',
  ]);
  function strip(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!NON_DOM.has(key) && !key.startsWith('$')) clean[key] = props[key];
    }
    return clean;
  }

  return {
    TamaguiProvider: ({ children }) => children,
    useTheme: () => ({
      background: 'white',
      color: 'black',
      borderColor: 'gray',
      backgroundColor: 'white',
    }),
    YStack: ({ children, ...props }) =>
      React.createElement('div', strip(props), children),
    XStack: ({ children, ...props }) =>
      React.createElement('div', strip(props), children),
    Button: ({ children, ...props }) =>
      React.createElement('button', strip(props), children),
    Input: (props) => React.createElement('input', strip(props)),
    Select: Object.assign(
      ({ children, ...props }) =>
        React.createElement('select', strip(props), children),
      {
        Trigger: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Value: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Icon: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Adapt: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Content: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        ScrollUpButton: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        ScrollDownButton: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Viewport: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Item: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        ItemText: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        ItemIndicator: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
      },
    ),
    Sheet: Object.assign(
      ({ children, ...props }) =>
        React.createElement('div', strip(props), children),
      {
        Frame: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        ScrollView: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
      },
    ),
    ScrollView: ({ children, ...props }) =>
      React.createElement('div', strip(props), children),
    Text: ({ children, ...props }) =>
      React.createElement('div', strip(props), children),
    Card: Object.assign(
      ({ children, onPress, testID, ...props }) =>
        React.createElement(
          'div',
          { ...strip(props), onClick: onPress, 'data-testid': testID },
          children,
        ),
      {
        Header: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Footer: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
      },
    ),
    H1: ({ children, ...props }) =>
      React.createElement('h1', strip(props), children),
    H2: ({ children, ...props }) =>
      React.createElement('h2', strip(props), children),
    H3: ({ children, ...props }) =>
      React.createElement('h3', strip(props), children),
    H4: ({ children, ...props }) =>
      React.createElement('h4', strip(props), children),
    Paragraph: ({ children, ...props }) =>
      React.createElement('p', strip(props), children),
    Image: ({ source, ...props }) =>
      React.createElement('img', { ...strip(props), src: source?.uri }),
    Spinner: (props) => React.createElement('div', strip(props), 'Loading...'),
    Separator: (props) => React.createElement('hr', strip(props)),
    Tooltip: Object.assign(
      ({ children, ...props }) =>
        React.createElement('div', strip(props), children),
      {
        Trigger: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Content: ({ children, ...props }) =>
          React.createElement('div', strip(props), children),
        Arrow: () => null,
      },
    ),
    styled: (Component) => Component,
    useThemeState: () => ({ theme: 'light' }),
    createTheme: () => ({}),
  };
});

// Mock Lucide icons from @tamagui/lucide-icons
jest.mock('@tamagui/lucide-icons', () => {
  const React = require('react');
  const ICON_NON_DOM = new Set([
    'size',
    'color',
    'strokeWidth',
    'fill',
    'scaleIcon',
    'animation',
    'enterStyle',
    'exitStyle',
    'pressStyle',
    'hoverStyle',
    'focusStyle',
    'animateOnly',
    'themeInverse',
    'chromeless',
    'elevate',
    'bordered',
    'circular',
    'unstyled',
    'testID',
    'accessibilityLabel',
    'accessibilityRole',
    'onPress',
    'onPressIn',
    'onPressOut',
    'backgroundColor',
    'borderRadius',
    'borderColor',
    'borderWidth',
    'opacity',
    'padding',
    'margin',
    'flex',
    'alignItems',
    'justifyContent',
    'position',
    'zIndex',
    'display',
    'overflow',
    'active',
    'width',
    'height',
  ]);
  function stripIcon(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!ICON_NON_DOM.has(key) && !key.startsWith('$'))
        clean[key] = props[key];
    }
    return clean;
  }
  const icon = (label) => (props) =>
    React.createElement(
      'div',
      { ...stripIcon(props), 'data-testid': label },
      label,
    );
  return {
    AlertCircle: icon('AlertCircle'),
    AlertTriangle: icon('AlertTriangle'),
    ArrowLeftRight: icon('ArrowLeftRight'),
    ArrowUpDown: icon('ArrowUpDown'),
    Check: icon('Check'),
    ChevronDown: icon('ChevronDown'),
    ChevronRight: icon('ChevronRight'),
    ChevronUp: icon('ChevronUp'),
    Clock: icon('Clock'),
    History: icon('History'),
    MessageSquare: icon('MessageSquare'),
    RefreshCw: icon('RefreshCw'),
    Search: icon('Search'),
    Send: icon('Send'),
    Shield: icon('Shield'),
    Users: icon('Users'),
    X: icon('X'),
    Zap: icon('Zap'),
  };
});

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
