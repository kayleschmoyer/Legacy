// Web-specific Jest setup - using CommonJS for Jest compatibility
require('@testing-library/jest-dom');

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

// Mock ResizeObserver (following Tamagui's testing pattern)
global.ResizeObserver = function ResizeObserver(cb) {
  this.cb = cb;
  this.observe = () => {
    this.cb([{ borderBoxSize: { inlineSize: 0, blockSize: 0 } }]);
  };
  this.unobserve = () => {
    // No-op for mock
  };
  this.disconnect = () => {
    // No-op for mock
  };
};

// Mock the platform-components module completely for web platform
jest.mock('./src/platform-components', () => {
  const React = require('react');

  const Platform = {
    OS: 'web',
    Version: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    select: function (specifics) {
      return specifics.web ?? specifics.default;
    },
  };

  const Dimensions = {
    get: jest.fn(() => ({ width: 1024, height: 768 })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  return {
    Platform,
    Dimensions,
    Text: ({ children, ...props }) =>
      React.createElement('span', props, children),
    View: ({ children, ...props }) =>
      React.createElement('div', props, children),
    TouchableOpacity: ({ children, onPress, ...props }) =>
      React.createElement('button', { onClick: onPress, ...props }, children),
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => style,
    },
    Modal: ({ children, visible, ...props }) =>
      visible ? React.createElement('div', props, children) : null,
    Animated: {
      View: ({ children, ...props }) =>
        React.createElement('div', props, children),
      Text: ({ children, ...props }) =>
        React.createElement('span', props, children),
      Value: jest.fn(() => ({
        setValue: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        interpolate: jest.fn(),
      })),
      timing: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
      })),
      spring: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
      })),
    },
    Table: ({ children, ...props }) =>
      React.createElement('table', props, children),
    FlatList: ({ data, renderItem, ...props }) => {
      if (!data || !renderItem) return React.createElement('div', props);
      return React.createElement(
        'div',
        props,
        data.map((item, index) => renderItem({ item, index })),
      );
    },
    ScrollView: ({ children, ...props }) =>
      React.createElement('div', props, children),
    SafeAreaView: ({ children, ...props }) =>
      React.createElement('div', props, children),
    KeyboardAvoidingView: ({ children, ...props }) =>
      React.createElement('div', props, children),
    TextInput: ({ onChangeText, editable, value, ...props }) => {
      return React.createElement('input', {
        ...props,
        onChange: onChangeText
          ? (e) => onChangeText(e.target.value)
          : props.onChange,
        readOnly: editable === false,
        defaultValue: value !== undefined && !onChangeText ? value : undefined,
        value: onChangeText ? value : undefined,
      });
    },
    Image: (props) => React.createElement('img', props),
    Pressable: ({ children, onPress, ...props }) =>
      React.createElement('button', { onClick: onPress, ...props }, children),
    ActivityIndicator: (props) =>
      React.createElement('div', props, 'Loading...'),
    Picker: ({ children, ...props }) =>
      React.createElement('select', props, children),
    Vibration: {
      vibrate: jest.fn(),
      cancel: jest.fn(),
    },
    Alert: {
      alert: jest.fn(),
    },
    Icon: ({ children, ...props }) => React.createElement('i', props, children),
    SecureStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    OAuthProvider: ({ children }) => React.createElement('div', {}, children),
    SecureStorageProvider: ({ children }) =>
      React.createElement('div', {}, children),
    PlatformProviders: ({ children }) =>
      React.createElement('div', {}, children),
    PlatformUtils: {
      isWeb: true,
      isMobile: false,
    },
  };
});

// Mock React Native completely to avoid import issues
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj) => obj.web || obj.default || obj.ios,
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 1024, height: 768 })),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
    compose: (...styles) => Object.assign({}, ...styles),
  },
  Touchable: {
    Mixin: {}, // Mock for react-native-svg compatibility
  },
  processColor: jest.fn((color) => color), // Mock for react-native-svg
  View: 'div',
  Text: 'span',
  TouchableOpacity: 'button',
}));

// Make StyleSheet available globally for react-native-svg
global.StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
  compose: (...styles) => Object.assign({}, ...styles),
};

// Mock react-native-svg completely
jest.mock('react-native-svg', () => {
  const React = require('react');

  // Create a generic SVG component factory
  const createSvgComponent = (tagName) => {
    return ({ children, ...props }) =>
      React.createElement(tagName, props, children);
  };

  return {
    Svg: createSvgComponent('svg'),
    Circle: createSvgComponent('circle'),
    Ellipse: createSvgComponent('ellipse'),
    G: createSvgComponent('g'),
    Text: createSvgComponent('text'),
    TSpan: createSvgComponent('tspan'),
    TextPath: createSvgComponent('textPath'),
    Path: createSvgComponent('path'),
    Polygon: createSvgComponent('polygon'),
    Polyline: createSvgComponent('polyline'),
    Line: createSvgComponent('line'),
    Rect: createSvgComponent('rect'),
    Use: createSvgComponent('use'),
    Image: createSvgComponent('image'),
    Symbol: createSvgComponent('symbol'),
    Defs: createSvgComponent('defs'),
    LinearGradient: createSvgComponent('linearGradient'),
    RadialGradient: createSvgComponent('radialGradient'),
    Stop: createSvgComponent('stop'),
    ClipPath: createSvgComponent('clipPath'),
    Pattern: createSvgComponent('pattern'),
    Mask: createSvgComponent('mask'),
    // Mock other exports that might be used
    withLocalSvg: jest.fn(),
    LocalSvg: createSvgComponent('svg'),
    SvgXml: createSvgComponent('svg'),
    SvgUri: createSvgComponent('svg'),
  };
});

// Note: @tamagui/lucide-icons is mocked later with all required icons

// Mock Tamagui completely
jest.mock('tamagui', () => {
  const React = require('react');
  return {
    TamaguiProvider: ({ children }) => React.createElement('div', {}, children),
    useTheme: () => ({
      background: 'white',
      color: 'black',
      borderColor: 'gray',
      backgroundColor: 'white',
    }),
    YStack: ({ children, onPress, onPressIn, onPressOut, ...props }) =>
      React.createElement(
        'div',
        {
          ...props,
          onClick: onPress,
          onMouseDown: onPressIn,
          onMouseUp: onPressOut,
        },
        children,
      ),
    XStack: ({ children, onPress, onPressIn, onPressOut, ...props }) =>
      React.createElement(
        'div',
        {
          ...props,
          onClick: onPress,
          onMouseDown: onPressIn,
          onMouseUp: onPressOut,
        },
        children,
      ),
    Button: ({ children, onPress, unstyled, ...props }) => {
      const { editable, onChangeText, ...domProps } = props;
      return React.createElement(
        'button',
        {
          ...domProps,
          onClick: onPress,
          // Remove React Native specific props that cause DOM warnings
          'data-unstyled': unstyled,
        },
        children,
      );
    },
    Input: ({ onChangeText, editable, value, unstyled, ...props }) => {
      return React.createElement('input', {
        ...props,
        onChange: onChangeText
          ? (e) => onChangeText(e.target.value)
          : props.onChange,
        readOnly: editable === false,
        defaultValue:
          value !== undefined && !onChangeText && !props.onChange
            ? value
            : undefined,
        value: onChangeText || props.onChange ? value : undefined,
        'data-unstyled': unstyled,
      });
    },
    Text: ({ children, ...props }) =>
      React.createElement('span', props, children),
    H1: ({ children, ...props }) => React.createElement('h1', props, children),
    H2: ({ children, ...props }) => React.createElement('h2', props, children),
    H3: ({ children, ...props }) => React.createElement('h3', props, children),
    H4: ({ children, ...props }) => React.createElement('h4', props, children),
    Paragraph: ({ children, ...props }) =>
      React.createElement('p', props, children),
    ScrollView: ({ children, ...props }) =>
      React.createElement('div', props, children),
    Card: ({ children, onPress, onPressIn, onPressOut, ...props }) => {
      const { pressStyle, ...domProps } = props;
      return React.createElement(
        'div',
        {
          ...domProps,
          onClick: onPress,
          onMouseDown: onPressIn,
          onMouseUp: onPressOut,
          'data-press-style': pressStyle
            ? JSON.stringify(pressStyle)
            : undefined,
        },
        children,
      );
    },
    Spinner: ({ ...props }) => React.createElement('div', props, 'Loading...'),
    Separator: ({ ...props }) => React.createElement('hr', props),
    Select: Object.assign(
      ({ children, ...props }) => React.createElement('div', props, children),
      {
        Trigger: ({ children, ...props }) =>
          React.createElement('button', props, children),
        Value: ({ placeholder, ...props }) =>
          React.createElement('span', props, placeholder),
        Icon: ({ children, ...props }) =>
          React.createElement('span', props, children),
        Content: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Item: ({ children, ...props }) =>
          React.createElement('div', props, children),
        ItemText: ({ children, ...props }) =>
          React.createElement('span', props, children),
        ItemIndicator: ({ children, ...props }) =>
          React.createElement('span', props, children),
        Group: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Label: ({ children, ...props }) =>
          React.createElement('label', props, children),
        Viewport: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Adapt: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Portal: ({ children, ...props }) =>
          React.createElement('div', props, children),
        ScrollUpButton: ({ children, ...props }) =>
          React.createElement('button', props, children),
        ScrollDownButton: ({ children, ...props }) =>
          React.createElement('button', props, children),
      },
    ),
    Sheet: Object.assign(
      ({ children, ...props }) => React.createElement('div', props, children),
      {
        Frame: ({ children, ...props }) =>
          React.createElement('div', props, children),
        ScrollView: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Handle: ({ children, ...props }) =>
          React.createElement('div', props, children),
        Overlay: ({ children, ...props }) =>
          React.createElement('div', props, children),
      },
    ),
  };
});

// Mock @tamagui/core separately
jest.mock('@tamagui/core', () => {
  const React = require('react');
  return {
    TamaguiProvider: ({ children }) => React.createElement('div', {}, children),
    useTheme: () => ({
      background: 'white',
      color: 'black',
      borderColor: 'gray',
      backgroundColor: 'white',
    }),
    styled: () => () => 'div',
    usePropsAndStyle: () => [{}, { className: '' }],
    createTamagui: () => ({}),
    getTokens: () => ({}),
    getThemes: () => ({}),
  };
});

// Mock @tamagui/helpers-icon
jest.mock('@tamagui/helpers-icon', () => {
  const React = require('react');
  return {
    usePropsAndStyle: () => [{}, { className: '' }],
    themed:
      (Component) =>
      ({ children, ...props }) =>
        React.createElement('div', props, children),
  };
});

// Mock individual Tamagui icon packages (merged to include all needed icons)
jest.mock('@tamagui/lucide-icons', () => {
  const React = require('react');
  const createIcon =
    (name) =>
    ({ children, ...props }) =>
      React.createElement(
        'div',
        { ...props, 'data-testid': name },
        children || '🔷',
      );

  return {
    // Icons needed by PlayersTable
    ArrowUpDown: createIcon('ArrowUpDown'),
    ChevronDown: createIcon('ChevronDown'),
    RefreshCw: createIcon('RefreshCw'),
    Search: createIcon('Search'),
    Tag: createIcon('Tag'),
    User: createIcon('User'),
    // Other icons used throughout the app
    ChevronUp: createIcon('ChevronUp'),
    Filter: createIcon('Filter'),
    X: createIcon('X'),
    Check: createIcon('Check'),
    Plus: createIcon('Plus'),
    Minus: createIcon('Minus'),
    ArrowLeft: createIcon('ArrowLeft'),
    ArrowRight: createIcon('ArrowRight'),
    Calendar: createIcon('Calendar'),
    Settings: createIcon('Settings'),
    Sort: createIcon('Sort'),
  };
});

jest.mock('@tamagui/sheet', () => {
  const React = require('react');
  return {
    Sheet: {
      Frame: ({ children, ...props }) =>
        React.createElement('div', props, children),
      ScrollView: ({ children, ...props }) =>
        React.createElement('div', props, children),
    },
  };
});

// Console suppression for tests - allow important errors/warnings to show
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = (...args) => {
    // Allow test-specific errors but suppress React warnings
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      !args[0].includes('Warning:') &&
      !args[0].includes('validateDOMNesting') &&
      !args[0].includes('React does not recognize') &&
      !args[0].includes('Missing theme')
    ) {
      originalError(...args);
    }
  };

  console.warn = (...args) => {
    // Allow test-specific warnings but suppress component and Apollo warnings
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      !args[0].includes('Warning:') &&
      !args[0].includes('componentWillReceiveProps') &&
      !args[0].includes('canonizeResults') &&
      !args[0].includes('addTypename') &&
      !args[0].includes('go.apollo.dev')
    ) {
      originalWarn(...args);
    }
  };
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
