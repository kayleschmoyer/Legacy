// Manual mock for react-native to avoid Jest resolver issues with react-native-web
// This provides a minimal mock of react-native functionality for tests

const mockWindowDimensions = { width: 1024, height: 768 };

const mockStyleSheet = {
  create: (styles) => styles,
  hairlineWidth: 1,
  absoluteFill: {},
  flatten: (style) => style,
};

module.exports = {
  // Platform
  Platform: {
    OS: 'web',
    select: (options) => options.web || options.default,
    Version: '',
    isTesting: true,
  },
  // Styling
  StyleSheet: mockStyleSheet,
  Dimensions: {
    get: () => ({ ...mockWindowDimensions }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  // Real react-native(-web) exports this alongside Dimensions, and shared
  // components use it as their cross-platform viewport-width source (e.g.
  // elite-draft's useDraftViewportTier, PlayerComparison, PlayoffBracket).
  // Without it those components throw "useWindowDimensions is not a function"
  // the moment they render here. Returns the same object Dimensions.get()
  // does so a test can't see the two disagree; 1024 lands in the desktop
  // tier, which is the wide-viewport layout these specs assert against.
  useWindowDimensions: () => ({ ...mockWindowDimensions }),
  PixelRatio: {
    get: () => 1,
    getPixelSizeForLayoutSize: (size) => size,
    getFontScale: () => 1,
    roundToNearestPixel: (pixels) => pixels,
  },
  // Basic components as passthrough
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  Button: 'Button',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  // Event handling
  AppState: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    currentState: 'active',
  },
  // Other utilities
  Animated: {
    Value: jest.fn(),
    timing: jest.fn(),
    spring: jest.fn(),
    View: 'Animated.View',
    Text: 'Animated.Text',
    Image: 'Animated.Image',
    createAnimatedComponent: (component) => component,
  },
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    quad: jest.fn(),
    cubic: jest.fn(),
  },
  // Accessibility
  AccessibilityInfo: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    announceForAccessibility: jest.fn(),
  },
  // Keyboard
  Keyboard: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    dismiss: jest.fn(),
  },
  // Linking
  Linking: {
    openURL: jest.fn(),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
    getInitialURL: jest.fn(() => Promise.resolve(null)),
    addEventListener: jest.fn(),
  },
  // Alert
  Alert: {
    alert: jest.fn(),
    prompt: jest.fn(),
  },
  // Other common APIs
  NativeModules: {},
  NativeEventEmitter: jest.fn(),
  findNodeHandle: jest.fn(),
};
