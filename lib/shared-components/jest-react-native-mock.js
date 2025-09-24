// React Native mock using official React Native jest utilities
// This avoids the Flow parsing issues in the react-native preset while using official mocks

const React = require('react');

// Try to use official React Native mock utilities where possible
let mockComponent;
try {
  // Use official React Native mockComponent utility
  mockComponent = require('react-native/jest/mockComponent');
} catch {
  // Fallback if not available
  mockComponent = (componentName) => {
    const Component = React.forwardRef((props, ref) => {
      return React.createElement(componentName, { ...props, ref });
    });
    Component.displayName = componentName;
    return Component;
  };
}

// Core React Native APIs - these are the essential mocks we need
const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
  compose: (style1, style2) => [style1, style2],
  hairlineWidth: 1,
  absoluteFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  absoluteFillObject: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

const Dimensions = {
  get: (dim) => {
    if (dim === 'window') {
      return { width: 375, height: 667, scale: 2, fontScale: 1 };
    }
    if (dim === 'screen') {
      return { width: 375, height: 667, scale: 2, fontScale: 1 };
    }
    return { width: 375, height: 667, scale: 2, fontScale: 1 };
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  set: jest.fn(),
};

const Platform = {
  OS: 'web',
  select: (objs) => objs.web || objs.default || objs.ios || objs.android,
  Version: 1,
  isPad: false,
  isTesting: true,
  isTV: false,
};

const PixelRatio = {
  get: () => 2,
  getFontScale: () => 1,
  getPixelSizeForLayoutSize: (layoutSize) => Math.round(layoutSize * 2),
  roundToNearestPixel: (layoutSize) => Math.round(layoutSize * 2) / 2,
  startDetecting: jest.fn(),
};

// Animated - simplified but functional mock
const createAnimatedValue = (initialValue = 0) => ({
  setValue: jest.fn(),
  setOffset: jest.fn(),
  flattenOffset: jest.fn(),
  extractOffset: jest.fn(),
  addListener: jest.fn(() => 'listener_id'),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  stopAnimation: jest.fn(),
  resetAnimation: jest.fn(),
  interpolate: jest.fn(() => 'interpolated_value'),
  _value: initialValue,
});

const Animated = {
  Value: jest.fn(createAnimatedValue),
  ValueXY: jest.fn(() => ({
    ...createAnimatedValue(),
    x: createAnimatedValue(),
    y: createAnimatedValue(),
  })),
  timing: jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
    stop: jest.fn(),
    reset: jest.fn(),
  })),
  spring: jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
    stop: jest.fn(),
    reset: jest.fn(),
  })),
  decay: jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
    stop: jest.fn(),
    reset: jest.fn(),
  })),
  sequence: jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
    stop: jest.fn(),
    reset: jest.fn(),
  })),
  parallel: jest.fn(() => ({
    start: jest.fn((callback) => callback && callback()),
    stop: jest.fn(),
    reset: jest.fn(),
  })),
  createAnimatedComponent: (Component) => Component,
  View: React.forwardRef((props, ref) =>
    React.createElement('div', { ...props, ref }),
  ),
  Text: React.forwardRef((props, ref) =>
    React.createElement('span', { ...props, ref }),
  ),
  ScrollView: React.forwardRef((props, ref) =>
    React.createElement('div', { ...props, ref }),
  ),
  Image: React.forwardRef((props, ref) =>
    React.createElement('img', { ...props, ref }),
  ),
  FlatList: React.forwardRef((props, ref) =>
    React.createElement('div', { ...props, ref }),
  ),
};

// Essential components using the official mock utility
const components = {
  View: mockComponent('View'),
  Text: mockComponent('Text'),
  Image: mockComponent('Image'),
  ScrollView: mockComponent('ScrollView'),
  FlatList: mockComponent('FlatList'),
  SectionList: mockComponent('SectionList'),
  TextInput: mockComponent('TextInput'),
  TouchableOpacity: mockComponent('TouchableOpacity'),
  TouchableHighlight: mockComponent('TouchableHighlight'),
  TouchableWithoutFeedback: mockComponent('TouchableWithoutFeedback'),
  Pressable: mockComponent('Pressable'),
  Button: mockComponent('Button'),
  Switch: mockComponent('Switch'),
  ActivityIndicator: mockComponent('ActivityIndicator'),
  Modal: mockComponent('Modal'),
  SafeAreaView: mockComponent('SafeAreaView'),
  KeyboardAvoidingView: mockComponent('KeyboardAvoidingView'),
};

// Mock for react-native-svg (this is what's causing the Touchable.Mixin errors)
const svgComponents = {
  Svg: mockComponent('Svg'),
  Circle: mockComponent('Circle'),
  Ellipse: mockComponent('Ellipse'),
  G: mockComponent('G'),
  Text: mockComponent('SvgText'),
  TSpan: mockComponent('TSpan'),
  TextPath: mockComponent('TextPath'),
  Path: mockComponent('Path'),
  Polygon: mockComponent('Polygon'),
  Polyline: mockComponent('Polyline'),
  Line: mockComponent('Line'),
  Rect: mockComponent('Rect'),
  Use: mockComponent('Use'),
  Image: mockComponent('SvgImage'),
  Symbol: mockComponent('Symbol'),
  Defs: mockComponent('Defs'),
  LinearGradient: mockComponent('LinearGradient'),
  RadialGradient: mockComponent('RadialGradient'),
  Stop: mockComponent('Stop'),
  ClipPath: mockComponent('ClipPath'),
  Pattern: mockComponent('Pattern'),
  Mask: mockComponent('Mask'),
  Marker: mockComponent('Marker'),
};

// Touchable mock that fixes the react-native-svg Mixin error
const Touchable = {
  Mixin: {
    touchableHandlePress: jest.fn(),
    touchableHandleActivePressIn: jest.fn(),
    touchableHandleActivePressOut: jest.fn(),
    touchableHandleLongPress: jest.fn(),
    touchableGetPressRectOffset: jest.fn(),
    touchableGetHitSlop: jest.fn(),
    touchableGetHighlightDelayMS: jest.fn(),
    touchableGetLongPressDelayMS: jest.fn(),
    touchableGetPressOutDelayMS: jest.fn(),
    reset: jest.fn(),
  },
};

// Export everything React Native needs
module.exports = {
  // Core APIs
  StyleSheet,
  Dimensions,
  PixelRatio,
  Platform,
  Animated,
  Touchable,

  // Components
  ...components,

  // For react-native-svg
  ...svgComponents,

  // Additional utilities
  NativeModules: {},
  NativeEventEmitter: jest.fn(() => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  })),

  // Common utilities that components might use
  Alert: { alert: jest.fn(), prompt: jest.fn() },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
    getInitialURL: jest.fn(() => Promise.resolve(null)),
  },
};
