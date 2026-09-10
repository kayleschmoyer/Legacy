// Set up testing library
import '@testing-library/jest-dom';

// Mock window.matchMedia — this project's testEnvironment is jsdom (there is
// no real React Native DOM to test against), so `typeof window` is not
// 'undefined' the way it is on-device, and unmocked code that calls
// `window.matchMedia` (e.g. the shared `components/Dialog`'s
// useReducedMotion()) throws "window.matchMedia is not a function" instead
// of hitting that hook's native early-return. Mirrors jest-setup-web.js.
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

// Mock Tamagui early to avoid React Native props leaking to DOM
jest.mock('@tamagui/core', () => {
  const React = require('react');

  // List of React Native-specific props that should not be passed to DOM elements
  const reactNativeProps = new Set([
    'showsVerticalScrollIndicator',
    'showsHorizontalScrollIndicator',
    'bounces',
    'scrollEnabled',
    'pagingEnabled',
    'decelerationRate',
    'snapToAlignment',
    'textAlign',
    'textAlignVertical',
    'includeFontPadding',
    'textDecorationLine',
    'borderWidth',
    'borderColor',
    'borderRadius',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'backgroundColor',
    'shadowColor',
    'shadowOffset',
    'shadowOpacity',
    'shadowRadius',
    'elevation',
    'paddingVertical',
    'paddingHorizontal',
    'marginVertical',
    'marginHorizontal',
    'alignItems',
    'justifyContent',
    'flexDirection',
    'flexWrap',
    'alignSelf',
    'alignContent',
    'flex',
    'flexBasis',
    'flexGrow',
    'flexShrink',
    'aspectRatio',
    'position',
    'pressStyle',
    'hoverStyle',
    'focusStyle',
    'exitStyle',
    'enterStyle',
    'animation',
    'animateOnly',
    'debug',
    'disabled',
    'hitSlop',
    'userSelect',
    'cursor',
    'outlineColor',
    'outlineStyle',
    'outlineWidth',
    'editable',
    // Text props
    'numberOfLines',
    'lineHeight',
    'fontFamily',
    'fontSize',
    'fontWeight',
    // Event handlers
    'onPressIn',
    'onPressOut',
    'onValueChange',
    'onSubmitEditing',
    // Input props
    'placeholderTextColor',
    'returnKeyType',
    'multiline',
    'secureTextEntry',
    // Layout props
    'horizontal',
    'vertical',
    'unstyled',
    // Tamagui shorthand props
    'f',
    'p',
    'pt',
    'pr',
    'pb',
    'pl',
    'm',
    'mt',
    'mr',
    'mb',
    'ml',
    'w',
    'h',
    'bg',
    'theme',
    'themeInverse',
    'group',
    'tag',
    'space',
    'spaceDirection',
    'top',
    'right',
    'bottom',
    'left',
    'zIndex',
    'width',
    'height',
    'maxWidth',
    'maxHeight',
    'minWidth',
    'minHeight',
    'padding',
    'margin',
    'color',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    // Tamagui size variants
    'minW',
    'minH',
    'maxW',
    'maxH',
  ]);

  const createSafeComponent = (name, defaultElement = 'div') => {
    const Component = ({ children, ...props }) => {
      // Filter out React Native specific props
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (!reactNativeProps.has(key)) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(defaultElement, filteredProps, children);
    };
    Component.displayName = name;
    return Component;
  };

  // Create mock Select components with nested structure
  const createSelectComponents = () => {
    const SelectRoot = createSafeComponent('Select', 'div');

    // Attach subcomponents
    SelectRoot.Trigger = createSafeComponent('Select.Trigger', 'div');
    SelectRoot.Value = createSafeComponent('Select.Value', 'span');
    SelectRoot.Content = createSafeComponent('Select.Content', 'div');
    SelectRoot.ScrollUpButton = createSafeComponent(
      'Select.ScrollUpButton',
      'button',
    );
    SelectRoot.Viewport = createSafeComponent('Select.Viewport', 'div');
    SelectRoot.Item = createSafeComponent('Select.Item', 'div');
    SelectRoot.ItemText = createSafeComponent('Select.ItemText', 'span');
    SelectRoot.ScrollDownButton = createSafeComponent(
      'Select.ScrollDownButton',
      'button',
    );

    return SelectRoot;
  };

  return {
    styled: jest.fn((component) => component),
    View: createSafeComponent('View', 'div'),
    Text: createSafeComponent('Text', 'span'),
    Stack: createSafeComponent('Stack', 'div'),
    YStack: createSafeComponent('YStack', 'div'),
    XStack: createSafeComponent('XStack', 'div'),
    ScrollView: createSafeComponent('ScrollView', 'div'),
    Button: createSafeComponent('Button', 'button'),
    Input: createSafeComponent('Input', 'input'),
    Spinner: createSafeComponent('Spinner', 'div'),
    Select: createSelectComponents(),
    H1: createSafeComponent('H1', 'h1'),
    H2: createSafeComponent('H2', 'h2'),
    H3: createSafeComponent('H3', 'h3'),
    H4: createSafeComponent('H4', 'h4'),
    H5: createSafeComponent('H5', 'h5'),
    H6: createSafeComponent('H6', 'h6'),
  };
});

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

// Mock React Native
jest.mock('react-native', () => {
  const React = require('react');

  // List of React Native-specific props that should not be passed to DOM elements
  const reactNativeProps = new Set([
    'showsVerticalScrollIndicator',
    'showsHorizontalScrollIndicator',
    'bounces',
    'scrollEnabled',
    'pagingEnabled',
    'decelerationRate',
    'snapToAlignment',
    'snapToInterval',
    'snapToOffsets',
    'snapToStart',
    'snapToEnd',
    'keyboardShouldPersistTaps',
    'keyboardDismissMode',
    'onContentSizeChange',
    'onMomentumScrollBegin',
    'onMomentumScrollEnd',
    'onScrollBeginDrag',
    'onScrollEndDrag',
    'refreshControl',
    'stickyHeaderIndices',
    'endFillColor',
    'overScrollMode',
    'scrollEventThrottle',
    'DEPRECATED_sendUpdatedChildFrames',
    'alwaysBounceHorizontal',
    'alwaysBounceVertical',
    'automaticallyAdjustContentInsets',
    'canCancelContentTouches',
    'centerContent',
    'contentInset',
    'contentInsetAdjustmentBehavior',
    'contentOffset',
    'delaysContentTouches',
    'directionalLockEnabled',
    'indicatorStyle',
    'maximumZoomScale',
    'minimumZoomScale',
    'pinchGestureEnabled',
    'scrollIndicatorInsets',
    'scrollsToTop',
    'showsHorizontalScrollIndicator',
    'showsVerticalScrollIndicator',
    'stickyHeaderHiddenOnScroll',
    'zoomScale',
    // Style props that are React Native specific
    'textAlign',
    'textAlignVertical',
    'includeFontPadding',
    'textDecorationLine',
    'textDecorationStyle',
    'textDecorationColor',
    'writingDirection',
    'fontVariant',
    'letterSpacing',
    'textTransform',
    'borderWidth',
    'borderColor',
    'borderRadius',
    'borderTopWidth',
    'borderTopColor',
    'borderRightWidth',
    'borderRightColor',
    'borderBottomWidth',
    'borderBottomColor',
    'borderLeftWidth',
    'borderLeftColor',
    'backgroundColor',
    'shadowColor',
    'shadowOffset',
    'shadowOpacity',
    'shadowRadius',
    'elevation',
    'paddingVertical',
    'paddingHorizontal',
    'marginVertical',
    'marginHorizontal',
    'alignItems',
    'justifyContent',
    'flexDirection',
    'flexWrap',
    'alignSelf',
    'alignContent',
    'flex',
    'flexBasis',
    'flexGrow',
    'flexShrink',
    'aspectRatio',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'start',
    'end',
    'zIndex',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'marginStart',
    'marginEnd',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'paddingStart',
    'paddingEnd',
    'width',
    'height',
    'minWidth',
    'maxWidth',
    'minHeight',
    'maxHeight',
    // Tamagui specific props
    'pressStyle',
    'hoverStyle',
    'focusStyle',
    'exitStyle',
    'enterStyle',
    'animation',
    'animateOnly',
    'debug',
    'disabled',
    'hitSlop',
    'userSelect',
    'cursor',
    'outlineColor',
    'outlineStyle',
    'outlineWidth',
    'editable',
  ]);

  // RN's accessibility API (accessibilityRole/accessibilityLabel) is the real,
  // correct one on-device — native accessibility services consume it natively,
  // with no DOM in the loop. This mock only exists because these components
  // render under jsdom in tests; here it maps those props to their DOM
  // equivalents (role/aria-label) so `getByRole`/`getByLabelText` queries in
  // specs written against DOM semantics resolve correctly against the
  // `.native.tsx` fork (LS-9264). Without this, accessibilityRole/Label pass
  // through as unrecognized attributes that no DOM query can match.
  function withAccessibilityAttrs(props, filteredProps) {
    if (props.accessibilityRole != null)
      filteredProps.role = props.accessibilityRole;
    if (props.accessibilityLabel != null)
      filteredProps['aria-label'] = props.accessibilityLabel;
    return filteredProps;
  }

  const createMockComponent = (name, defaultElement = 'div') => {
    const Component = ({ children, ...props }) => {
      // Filter out React Native specific props
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (
          key !== 'accessibilityRole' &&
          key !== 'accessibilityLabel' &&
          !reactNativeProps.has(key)
        ) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(
        defaultElement,
        withAccessibilityAttrs(props, filteredProps),
        children,
      );
    };
    Component.displayName = name;
    return Component;
  };

  return {
    Platform: {
      OS: 'ios',
      select: jest.fn((obj) => obj.ios || obj.default),
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 375, height: 812 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    useWindowDimensions: jest.fn(() => ({
      width: 375,
      height: 812,
      scale: 1,
      fontScale: 1,
    })),
    StatusBar: {
      setBarStyle: jest.fn(),
      setHidden: jest.fn(),
      setBackgroundColor: jest.fn(),
    },
    Vibration: {
      vibrate: jest.fn(),
      cancel: jest.fn(),
    },
    Alert: {
      alert: jest.fn(),
    },
    Linking: {
      openURL: jest.fn(),
      canOpenURL: jest.fn(() => Promise.resolve(true)),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    // Mock React Native components
    View: createMockComponent('View', 'div'),
    Text: createMockComponent('Text', 'span'),
    ScrollView: createMockComponent('ScrollView', 'div'),
    FlatList: ({ data, renderItem, keyExtractor, ...props }) => {
      const React = require('react');
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (!reactNativeProps.has(key)) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(
        'div',
        { 'data-testid': 'flatlist', ...filteredProps },
        data?.map((item, index) => {
          const key = keyExtractor ? keyExtractor(item, index) : index;
          const element = renderItem
            ? renderItem({ item, index, separators: {} })
            : null;
          return element ? React.cloneElement(element, { key }) : null;
        }),
      );
    },
    ActivityIndicator: createMockComponent('ActivityIndicator', 'div'),
    KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView', 'div'),
    TouchableOpacity: ({ children, onPress, ...props }) => {
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (
          key !== 'accessibilityRole' &&
          key !== 'accessibilityLabel' &&
          !reactNativeProps.has(key)
        ) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(
        'button',
        { onClick: onPress, ...withAccessibilityAttrs(props, filteredProps) },
        children,
      );
    },
    Image: ({ source, ...props }) => {
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (!reactNativeProps.has(key)) {
          filteredProps[key] = value;
        }
      }
      const src = typeof source === 'object' && source ? source.uri : source;
      return React.createElement('img', { src, ...filteredProps });
    },
    TextInput: createMockComponent('TextInput', 'input'),
    SafeAreaView: createMockComponent('SafeAreaView', 'div'),
    Modal: createMockComponent('Modal', 'div'),
    Pressable: ({ children, onPress, ...props }) => {
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (
          key !== 'accessibilityRole' &&
          key !== 'accessibilityLabel' &&
          !reactNativeProps.has(key)
        ) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(
        'button',
        { onClick: onPress, ...withAccessibilityAttrs(props, filteredProps) },
        typeof children === 'function'
          ? children({ pressed: false })
          : children,
      );
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
      isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
      announceForAccessibility: jest.fn(),
    },
    Animated: {
      View: createMockComponent('Animated.View', 'div'),
      Text: createMockComponent('Animated.Text', 'span'),
      ScrollView: createMockComponent('Animated.ScrollView', 'div'),
      FlatList: createMockComponent('Animated.FlatList', 'div'),
      Image: createMockComponent('Animated.Image', 'img'),
      createAnimatedComponent: (Component) => Component,
      Value: function AnimatedValue(value) {
        this._value = value;
        this.setValue = function (value) {
          this._value = value;
        };
        this.addListener = function () {
          return 'mockListener';
        };
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.removeListener = function () {};
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.removeAllListeners = function () {};
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.stopAnimation = function () {};
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.resetAnimation = function () {};
        this.interpolate = function () {
          return this;
        };
        return this;
      },
      timing: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      spring: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      decay: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      sequence: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      parallel: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      stagger: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      loop: () => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }),
      event: jest.fn(),
    },
    Easing: {
      identity: (t) => t,
      linear: (t) => t,
      ease: (t) => t,
      quad: (t) => t,
      cubic: (t) => t,
      poly: () => (t) => t,
      sin: (t) => t,
      circle: (t) => t,
      exp: (t) => t,
      elastic: () => (t) => t,
      back: () => (t) => t,
      bounce: (t) => t,
      bezier: () => (t) => t,
      in: (easing) => easing,
      out: (easing) => easing,
      inOut: (easing) => easing,
    },
    InteractionManager: {
      runAfterInteractions: jest.fn((task) => {
        if (typeof task === 'function') task();
        return { cancel: () => undefined };
      }),
      createInteractionHandle: jest.fn(() => 1),
      clearInteractionHandle: jest.fn(),
    },
  };
});

// react-native-svg's real implementation pulls in `Touchable` from
// `react-native`, which this mobile jest environment's hand-rolled
// `react-native` mock (above) doesn't export — every mobile-native component
// that renders an SVG (GradientSurface, SportGlyph, BrandIcon, etc.) would
// otherwise fail with "Cannot destructure property 'Mixin' of
// '_reactNative.Touchable' as it is undefined" once native module resolution
// is exercised (LS-9180).
jest.mock('react-native-svg', () => {
  const React = require('react');
  const mockSvgComponent = (name) => {
    const Component = React.forwardRef((props, ref) =>
      React.createElement(name, { ...props, ref }, props.children),
    );
    Component.displayName = name;
    return Component;
  };
  const Svg = mockSvgComponent('Svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Circle: mockSvgComponent('Circle'),
    Ellipse: mockSvgComponent('Ellipse'),
    G: mockSvgComponent('G'),
    Text: mockSvgComponent('SvgText'),
    TSpan: mockSvgComponent('TSpan'),
    TextPath: mockSvgComponent('TextPath'),
    Path: mockSvgComponent('Path'),
    Polygon: mockSvgComponent('Polygon'),
    Polyline: mockSvgComponent('Polyline'),
    Line: mockSvgComponent('Line'),
    Rect: mockSvgComponent('Rect'),
    Use: mockSvgComponent('Use'),
    Image: mockSvgComponent('SvgImage'),
    Symbol: mockSvgComponent('Symbol'),
    Defs: mockSvgComponent('Defs'),
    LinearGradient: mockSvgComponent('LinearGradient'),
    RadialGradient: mockSvgComponent('RadialGradient'),
    Stop: mockSvgComponent('Stop'),
    ClipPath: mockSvgComponent('ClipPath'),
    Pattern: mockSvgComponent('Pattern'),
    Mask: mockSvgComponent('Mask'),
    Marker: mockSvgComponent('Marker'),
  };
});

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * estimateSize(),
        size: estimateSize(),
        key: index,
        lane: 0,
      })),
    getTotalSize: () => count * estimateSize(),
    measureElement: () => undefined,
    scrollToOffset: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

// Mock React Native Picker
jest.mock('@react-native-picker/picker', () => ({
  Picker: ({ children, onValueChange, selectedValue, ...props }) => {
    const React = require('react');

    // Same React Native props filter as above
    const reactNativeProps = new Set([
      'showsVerticalScrollIndicator',
      'showsHorizontalScrollIndicator',
      'bounces',
      'scrollEnabled',
      'pagingEnabled',
      'decelerationRate',
      'snapToAlignment',
      'snapToInterval',
      'snapToOffsets',
      'snapToStart',
      'snapToEnd',
      'keyboardShouldPersistTaps',
      'keyboardDismissMode',
      'onContentSizeChange',
      'onMomentumScrollBegin',
      'onMomentumScrollEnd',
      'onScrollBeginDrag',
      'onScrollEndDrag',
      'refreshControl',
      'stickyHeaderIndices',
      'endFillColor',
      'overScrollMode',
      'scrollEventThrottle',
      'DEPRECATED_sendUpdatedChildFrames',
      'alwaysBounceHorizontal',
      'alwaysBounceVertical',
      'automaticallyAdjustContentInsets',
      'canCancelContentTouches',
      'centerContent',
      'contentInset',
      'contentInsetAdjustmentBehavior',
      'contentOffset',
      'delaysContentTouches',
      'directionalLockEnabled',
      'indicatorStyle',
      'maximumZoomScale',
      'minimumZoomScale',
      'pinchGestureEnabled',
      'scrollIndicatorInsets',
      'scrollsToTop',
      'stickyHeaderHiddenOnScroll',
      'zoomScale',
      'textAlign',
      'textAlignVertical',
      'includeFontPadding',
      'textDecorationLine',
      'textDecorationStyle',
      'textDecorationColor',
      'writingDirection',
      'fontVariant',
      'letterSpacing',
      'textTransform',
      'borderWidth',
      'borderColor',
      'borderRadius',
      'borderTopWidth',
      'borderTopColor',
      'borderRightWidth',
      'borderRightColor',
      'borderBottomWidth',
      'borderBottomColor',
      'borderLeftWidth',
      'borderLeftColor',
      'backgroundColor',
      'shadowColor',
      'shadowOffset',
      'shadowOpacity',
      'shadowRadius',
      'elevation',
      'paddingVertical',
      'paddingHorizontal',
      'marginVertical',
      'marginHorizontal',
      'alignItems',
      'justifyContent',
      'flexDirection',
      'flexWrap',
      'alignSelf',
      'alignContent',
      'flex',
      'flexBasis',
      'flexGrow',
      'flexShrink',
      'aspectRatio',
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'start',
      'end',
      'zIndex',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'marginStart',
      'marginEnd',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'paddingStart',
      'paddingEnd',
      'width',
      'height',
      'minWidth',
      'maxWidth',
      'minHeight',
      'maxHeight',
      'pressStyle',
      'hoverStyle',
      'focusStyle',
      'exitStyle',
      'enterStyle',
      'animation',
      'animateOnly',
      'debug',
      'disabled',
      'hitSlop',
      'userSelect',
      'cursor',
      'outlineColor',
      'outlineStyle',
      'outlineWidth',
      'editable',
    ]);

    const filteredProps = {};
    for (const [key, value] of Object.entries(props)) {
      if (!reactNativeProps.has(key)) {
        filteredProps[key] = value;
      }
    }

    return React.createElement(
      'select',
      {
        onChange: (e) => onValueChange?.(e.target.value),
        value: selectedValue,
        ...filteredProps,
      },
      children,
    );
  },
}));

// Mock @react-native-google-signin/google-signin
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({})),
    signOut: jest.fn(() => Promise.resolve()),
    isSignedIn: jest.fn(() => Promise.resolve(false)),
    getCurrentUser: jest.fn(() => Promise.resolve(null)),
    getTokens: jest.fn(() => Promise.resolve({})),
    clearCachedAccessToken: jest.fn(() => Promise.resolve()),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

// Mock platform-components abstraction layer
jest.mock('./src/platform-components', () => {
  const React = require('react');

  const createMockComponent = (name, defaultElement = 'div') => {
    const Component = ({ children, ...props }) => {
      return React.createElement(defaultElement, props, children);
    };
    Component.displayName = name;
    return Component;
  };

  return {
    // Platform-specific providers and utilities
    OAuthProvider: () => null,
    SecureStorageProvider: () => null,
    PlatformProviders: ({ children }) => children,
    PlatformUtils: {},

    // React Native equivalents
    ActivityIndicator: createMockComponent('ActivityIndicator'),
    Alert: {
      alert: jest.fn(),
    },
    Animated: {
      View: createMockComponent('AnimatedView'),
      Text: createMockComponent('AnimatedText'),
      timing: jest.fn(() => ({ start: jest.fn() })),
      spring: jest.fn(() => ({ start: jest.fn() })),
      Value: jest.fn(() => ({
        setValue: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 375, height: 812 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    useWindowDimensions: jest.fn(() => ({
      width: 375,
      height: 812,
      scale: 1,
      fontScale: 1,
    })),
    // Unlike createMockComponent, this actually invokes `renderItem` over
    // `data` (mirrors the smarter FlatList mock in the `react-native` mock
    // above) — components importing FlatList via platform-components (the
    // cross-platform abstraction) need list items to render under test, not
    // just a props-passthrough div (LS-8832).
    FlatList: ({ data, renderItem, keyExtractor, ...props }) =>
      React.createElement(
        'div',
        props,
        data?.map((item, index) => {
          const key = keyExtractor ? keyExtractor(item, index) : index;
          const element = renderItem
            ? renderItem({ item, index, separators: {} })
            : null;
          return element ? React.cloneElement(element, { key }) : null;
        }),
      ),
    Image: createMockComponent('Image', 'img'),
    KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
    Modal: createMockComponent('Modal'),
    Picker: createMockComponent('Picker', 'select'),
    Platform: {
      OS: 'ios',
      select: jest.fn((obj) => obj.ios || obj.default),
    },
    Pressable: createMockComponent('Pressable', 'button'),
    SafeAreaView: createMockComponent('SafeAreaView'),
    ScrollView: createMockComponent('ScrollView'),
    StyleSheet: {
      create: jest.fn((styles) => styles),
      flatten: jest.fn(),
    },
    Text: createMockComponent('Text', 'span'),
    TextInput: createMockComponent('TextInput', 'input'),
    TouchableOpacity: createMockComponent('TouchableOpacity', 'button'),
    Vibration: {
      vibrate: jest.fn(),
      cancel: jest.fn(),
    },
    View: createMockComponent('View'),

    // Platform-specific components
    Icon: createMockComponent('Icon'),
    Table: createMockComponent('Table', 'table'),
    SecureStorage: {
      getItem: jest.fn(() => Promise.resolve(null)),
      setItem: jest.fn(() => Promise.resolve()),
      removeItem: jest.fn(() => Promise.resolve()),
    },
  };
});

// Mock expo modules
jest.mock('expo-constants', () => ({
  default: {
    statusBarHeight: 44,
  },
}));

// Skip async storage mock for now since it's not installed

// Enhanced ResizeObserver mock - function syntax to avoid lint errors
global.ResizeObserver = function ResizeObserver(callback) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    observe: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    unobserve: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    disconnect: () => {},
  };
};

// Mock Tamagui components for mobile environment
jest.mock('tamagui', () => {
  const React = require('react');

  // Props that are Tamagui/React-Native behavior or component config —
  // never valid as a DOM attribute or a CSS style value. Layout/style props
  // are handled separately below (STYLE_PROPS) so they reach the DOM as a
  // real `style` object instead of being dropped here (LS-9459).
  const reactNativeProps = new Set([
    'showsVerticalScrollIndicator',
    'showsHorizontalScrollIndicator',
    'bounces',
    'scrollEnabled',
    'pagingEnabled',
    'decelerationRate',
    'snapToAlignment',
    'textAlignVertical',
    'includeFontPadding',
    'shadowColor',
    'shadowOffset',
    'shadowOpacity',
    'shadowRadius',
    'elevation',
    'pressStyle',
    'hoverStyle',
    'focusStyle',
    'exitStyle',
    'enterStyle',
    'animation',
    'animateOnly',
    'debug',
    'disabled',
    'hitSlop',
    'editable',
    // Text props
    'numberOfLines',
    // Event handlers
    'onPressIn',
    'onPressOut',
    'onValueChange',
    'onSubmitEditing',
    // Input props
    'placeholderTextColor',
    'returnKeyType',
    'multiline',
    'secureTextEntry',
    // Layout props
    'horizontal',
    'vertical',
    'unstyled',
    // Tamagui shorthand props (single/double-letter aliases) — not expanded
    // to style; no spec under lib/shared-components/src/** relies on them.
    'f',
    'p',
    'pt',
    'pr',
    'pb',
    'pl',
    'm',
    'mt',
    'mr',
    'mb',
    'ml',
    'w',
    'h',
    'bg',
    'theme',
    'themeInverse',
    'group',
    'tag',
    'space',
    'spaceDirection',
    // Tamagui size variants (same shorthand-alias reasoning as above)
    'minW',
    'minH',
    'maxW',
    'maxH',
    // React Native Image prop (not valid on DOM <img>)
    'source',
    'active',
    'onPress',
    'onOpenChange',
    'chromeless',
    'bordered',
    'circular',
    'elevate',
    'size',
    'scaleIcon',
    'scaleSpace',
    'spaceFlex',
    'componentName',
    'disableOptimization',
    'forceStyle',
    'asChild',
    'separator',
    'pointerEvents',
    'contentContainerStyle',
    'modal',
    'open',
    'snapPoints',
    'dismissOnSnapToBottom',
    'snapPointsMode',
    'accessibilityLabel',
    'accessibilityRole',
    'accessibilityState',
    'accessibilityHint',
    'accessibilityValue',
    'testID',
    'ellipsizeMode',
    'selectable',
    'adjustsFontSizeToFit',
    'allowFontScaling',
    'minimumFontScale',
    'pressRetentionOffset',
    'keyboardType',
  ]);

  // Layout/style props Tamagui accepts as shorthand — forwarded into a real
  // `style` object (rather than dropped) so `toHaveStyle` assertions observe
  // what the component actually set. Values are numbers or CSS-value
  // strings; React DOM auto-appends `px` to non-unitless numeric style
  // properties (e.g. `paddingTop: 44` renders as `padding-top: 44px`), so no
  // manual unit conversion is needed here.
  const STYLE_PROPS = new Set([
    'textAlign',
    'textDecorationLine',
    'borderWidth',
    'borderColor',
    'borderRadius',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'backgroundColor',
    'alignItems',
    'justifyContent',
    'flexDirection',
    'flexWrap',
    'alignSelf',
    'alignContent',
    'flex',
    'flexBasis',
    'flexGrow',
    'flexShrink',
    'aspectRatio',
    'position',
    'userSelect',
    'cursor',
    'outlineColor',
    'outlineStyle',
    'outlineWidth',
    'lineHeight',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'top',
    'right',
    'bottom',
    'left',
    'zIndex',
    'width',
    'height',
    'maxWidth',
    'maxHeight',
    'minWidth',
    'minHeight',
    'padding',
    'margin',
    'color',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'textTransform',
    'letterSpacing',
    'opacity',
    'overflow',
    'display',
    'gap',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
    'whiteSpace',
    'wordBreak',
    'textOverflow',
  ]);

  // RN shorthand props with no 1:1 CSS property — expand to the per-edge
  // longhands STYLE_PROPS already understands.
  const STYLE_SHORTHAND_EXPANSIONS = {
    paddingVertical: ['paddingTop', 'paddingBottom'],
    paddingHorizontal: ['paddingLeft', 'paddingRight'],
    marginVertical: ['marginTop', 'marginBottom'],
    marginHorizontal: ['marginLeft', 'marginRight'],
  };

  // Helper to filter props, including $-prefixed Tamagui breakpoint props
  // ($gtSm, etc.). Layout/style shorthand props are not dropped — they are
  // collected into a real `style` object so mocked components render what
  // Tamagui would actually apply (LS-9459).
  function filterProps(props) {
    const filtered = {};
    const style = {};
    let hasStyle = false;
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('$') || key === 'style') continue;
      if (STYLE_PROPS.has(key)) {
        style[key] = value;
        hasStyle = true;
      } else if (STYLE_SHORTHAND_EXPANSIONS[key]) {
        for (const longhand of STYLE_SHORTHAND_EXPANSIONS[key]) {
          style[longhand] = value;
        }
        hasStyle = true;
      } else if (!reactNativeProps.has(key)) {
        filtered[key] = value;
      }
    }
    if (hasStyle || props.style) {
      filtered.style = { ...style, ...props.style };
    }
    return filtered;
  }

  // `reactNativeProps` strips testID and the accessibility props, which leaves
  // *ByTestId queries and accessibility assertions with nothing to match. Put
  // them back as DOM attributes: testID as the `data-testid` React Testing
  // Library queries (LS-8795 did this for jest-setup.js / jest-setup-web.js),
  // and the accessibility pair as inert `data-*` mirrors so no `*ByRole` or
  // `*ByLabelText` query anywhere else changes meaning (LS-8800).
  function withTestAttrs(props, filteredProps) {
    if (props.testID != null) filteredProps['data-testid'] = props.testID;
    if (props.accessibilityRole != null)
      filteredProps['data-accessibility-role'] = props.accessibilityRole;
    if (props.accessibilityLabel != null)
      filteredProps['data-accessibility-label'] = props.accessibilityLabel;
    return filteredProps;
  }

  const createMockComponent = (name, defaultElement = 'div') => {
    const Component = React.forwardRef(({ children, ...props }, ref) => {
      const filteredProps = filterProps(props);
      return React.createElement(
        defaultElement,
        { ref, ...withTestAttrs(props, filteredProps) },
        children,
      );
    });
    Component.displayName = name;
    return Component;
  };

  const createMockButton = (name = 'Button') => {
    const Component = React.forwardRef(
      (
        {
          children,
          onPress,
          icon,
          iconAfter,
          size,
          variant,
          disabled,
          ...props
        },
        ref,
      ) => {
        const filteredProps = filterProps(props);

        return React.createElement(
          'button',
          {
            ref,
            onClick: onPress,
            disabled,
            'data-variant': variant,
            'data-size': size,
            ...withTestAttrs(props, filteredProps),
          },
          [
            // Render icon before text if provided (handle both element and component)
            icon &&
              (React.isValidElement(icon)
                ? React.cloneElement(icon, { key: 'icon' })
                : React.createElement(icon, { key: 'icon', size: 16 })),
            // Render children (text)
            children,
            // Render icon after text if provided (handle both element and component)
            iconAfter &&
              (React.isValidElement(iconAfter)
                ? React.cloneElement(iconAfter, { key: 'iconAfter' })
                : React.createElement(iconAfter, {
                    key: 'iconAfter',
                    size: 16,
                  })),
          ],
        );
      },
    );
    Component.displayName = name;
    return Component;
  };

  const createMockInput = (name = 'Input') => {
    const Component = React.forwardRef(
      ({ onChangeText, value, placeholder, ...props }, ref) => {
        const filteredProps = filterProps(props);

        return React.createElement('input', {
          ref,
          onChange: (e) => onChangeText?.(e.target.value),
          value,
          placeholder,
          // See withTestAttrs above (LS-8800) — createMockComponent already
          // restores testID/accessibility props as data-* attributes;
          // createMockInput lacked the same restoration (LS-8832).
          ...withTestAttrs(props, filteredProps),
        });
      },
    );
    Component.displayName = name;
    return Component;
  };

  const createMockTextArea = (name = 'TextArea') => {
    const Component = React.forwardRef(
      ({ onChangeText, value, placeholder, ...props }, ref) => {
        const filteredProps = filterProps(props);

        return React.createElement('textarea', {
          ref,
          onChange: (e) => onChangeText?.(e.target.value),
          value,
          placeholder,
          ...withTestAttrs(props, filteredProps),
        });
      },
    );
    Component.displayName = name;
    return Component;
  };

  const mockExports = {
    // Safe passthrough stub for LS-9014's tamagui-config.ts createTokens()
    // override — specs mocking 'tamagui' don't need real token merging.
    createTokens: jest.fn((tokens) => tokens),
    styled: jest.fn((Component) => Component),
    // Theme is a token-scoping wrapper with no DOM footprint of its own —
    // passthrough (needed by e.g. BrandedSplash / AnimatedLaunchScreen).
    Theme: ({ children }) => children,
    useThemeName: jest.fn(() => 'dark'),
    // Every breakpoint false by default (desktop-equivalent); tests that need
    // a narrower viewport override with `(useMedia as jest.Mock).mockReturnValue(...)`
    // (mirrors the web mock in jest-setup-web.js).
    useMedia: jest.fn(() => ({})),
    Stack: createMockComponent('Stack', 'div'),
    YStack: React.forwardRef(
      ({ children, onPress, onPressIn, onPressOut, ...props }, ref) => {
        const filteredProps = filterProps(props);

        return React.createElement(
          'div',
          {
            ref,
            onClick: onPress,
            onMouseDown: onPressIn,
            onMouseUp: onPressOut,
            ...withTestAttrs(props, filteredProps),
          },
          children,
        );
      },
    ),
    XStack: React.forwardRef(
      ({ children, onPress, onPressIn, onPressOut, ...props }, ref) => {
        const filteredProps = filterProps(props);

        return React.createElement(
          'div',
          {
            ref,
            onClick: onPress,
            onMouseDown: onPressIn,
            onMouseUp: onPressOut,
            ...withTestAttrs(props, filteredProps),
          },
          children,
        );
      },
    ),
    Text: React.forwardRef(
      ({ children, onPress, onPressIn, onPressOut, ...props }, ref) => {
        const filteredProps = filterProps(props);

        return React.createElement(
          'span',
          {
            ref,
            onClick: onPress,
            onMouseDown: onPressIn,
            onMouseUp: onPressOut,
            ...withTestAttrs(props, filteredProps),
          },
          children,
        );
      },
    ),
    H2: createMockComponent('H2', 'h2'),
    H3: createMockComponent('H3', 'h3'),
    H4: createMockComponent('H4', 'h4'),
    Button: createMockButton('Button'),
    Card: Object.assign(
      React.forwardRef(
        (
          { children, onPress, onPressIn, onPressOut, testID, ...props },
          ref,
        ) => {
          const filteredProps = filterProps(props);
          return React.createElement(
            'div',
            {
              ref,
              onClick: onPress,
              onMouseDown: onPressIn,
              onMouseUp: onPressOut,
              'data-testid': testID,
              ...filteredProps,
            },
            children,
          );
        },
      ),
      {
        Header: ({ children, ...props }) =>
          React.createElement('div', filterProps(props), children),
        Footer: ({ children, ...props }) =>
          React.createElement('div', filterProps(props), children),
      },
    ),
    ScrollView: createMockComponent('ScrollView', 'div'),
    Separator: createMockComponent('Separator', 'hr'),
    Paragraph: createMockComponent('Paragraph', 'p'),
    H1: createMockComponent('H1', 'h1'),
    Input: createMockInput('Input'),
    TextArea: createMockTextArea('TextArea'),
    Anchor: createMockComponent('Anchor', 'a'),
    Image: createMockComponent('Image', 'img'),
    Spinner: createMockComponent('Spinner', 'div'),
    View: createMockComponent('View', 'div'),
    Checkbox: Object.assign(
      React.forwardRef(
        ({ children, checked, onCheckedChange, onPress, ...props }, ref) => {
          const filteredProps = filterProps(props);
          return React.createElement(
            'button',
            {
              ref,
              role: 'checkbox',
              'aria-checked': !!checked,
              onClick: (e) => {
                onPress?.(e);
                onCheckedChange?.(!checked);
              },
              ...withTestAttrs(props, filteredProps),
            },
            checked ? children : null,
          );
        },
      ),
      {
        Indicator: ({ children }) => children,
      },
    ),
    Select: Object.assign(
      ({
        children,
        onValueChange,
        value,
        'aria-label': rootAriaLabel,
        ...props
      }) => {
        let ariaLabel = rootAriaLabel;
        React.Children.forEach(children, (child) => {
          if (child && child.props && child.props['aria-label'] && !ariaLabel) {
            ariaLabel = child.props['aria-label'];
          }
        });
        return React.createElement(
          'select',
          {
            ...filterProps(props),
            value,
            'aria-label': ariaLabel || undefined,
            onChange: (e) => onValueChange?.(e.target.value),
          },
          children,
        );
      },
      {
        Trigger: ({ children }) =>
          React.createElement(React.Fragment, null, children),
        Value: ({ placeholder }) =>
          placeholder
            ? React.createElement(
                'option',
                { value: '', disabled: true, hidden: true },
                placeholder,
              )
            : null,
        Icon: () => null,
        Adapt: () => null,
        Portal: () => null,
        Content: ({ children }) =>
          React.createElement(React.Fragment, null, children),
        ScrollUpButton: () => null,
        ScrollDownButton: () => null,
        Viewport: ({ children }) =>
          React.createElement(React.Fragment, null, children),
        Item: ({ children, value: itemValue }) =>
          React.createElement('option', { value: itemValue }, children),
        ItemText: ({ children }) => children,
        ItemIndicator: () => null,
        Group: ({ children }) =>
          React.createElement(React.Fragment, null, children),
        Label: ({ children, ...props }) =>
          React.createElement('label', filterProps(props), children),
      },
    ),
    Adapt: Object.assign(
      ({ children }) => React.createElement(React.Fragment, null, children),
      { Contents: () => null },
    ),
    Sheet: (() => {
      const createSheetComponent = (name, defaultElement = 'div') => {
        const Component = ({ children, ...props }) => {
          return React.createElement(
            defaultElement,
            filterProps(props),
            children,
          );
        };
        Component.displayName = name;
        return Component;
      };

      const Sheet = ({ children, modal, dismissOnSnapToBottom, ...props }) => {
        return React.createElement('div', filterProps(props), children);
      };
      Sheet.displayName = 'Sheet';
      Sheet.Frame = createSheetComponent('Sheet.Frame', 'div');
      Sheet.ScrollView = createSheetComponent('Sheet.ScrollView', 'div');
      Sheet.Handle = createSheetComponent('Sheet.Handle', 'div');
      Sheet.Overlay = createSheetComponent('Sheet.Overlay', 'div');

      return Sheet;
    })(),
    Dialog: (() => {
      const Dialog = ({ children, open, onOpenChange, ...props }) => {
        if (open === false) {
          return React.createElement('div', {
            ...filterProps(props),
            'data-open': false,
          });
        }
        return React.createElement(
          'div',
          { ...filterProps(props), 'data-open': open },
          children,
        );
      };
      Dialog.displayName = 'Dialog';
      Dialog.Portal = ({ children, ...props }) =>
        React.createElement('div', filterProps(props), children);
      Dialog.Overlay = ({ children, ...props }) =>
        React.createElement('div', filterProps(props), children);
      Dialog.Content = ({ children, ...props }) =>
        React.createElement('div', filterProps(props), children);
      Dialog.Title = ({ children, ...props }) =>
        React.createElement('h2', filterProps(props), children);
      Dialog.Description = ({ children, ...props }) =>
        React.createElement('p', filterProps(props), children);
      Dialog.Close = ({ children, asChild, ...props }) =>
        asChild && React.isValidElement(children)
          ? children
          : React.createElement('button', filterProps(props), children);
      Dialog.Trigger = ({ children, asChild, ...props }) =>
        asChild && React.isValidElement(children)
          ? children
          : React.createElement('button', filterProps(props), children);
      return Dialog;
    })(),
    Tooltip: (() => {
      const Tooltip = ({ children }) =>
        React.createElement(React.Fragment, null, children);
      Tooltip.displayName = 'Tooltip';
      Tooltip.Trigger = ({ children }) =>
        React.createElement(React.Fragment, null, children);
      Tooltip.Content = ({ children, ...props }) =>
        React.createElement('div', filterProps(props), children);
      Tooltip.Arrow = () => null;
      return Tooltip;
    })(),
    VisuallyHidden: ({ children, ...props }) =>
      React.createElement('div', filterProps(props), children),
    // Mirrors jest-setup-web.js's `useMedia` mock — tests that need a
    // narrower viewport override with `(useMedia as jest.Mock).mockReturnValue(...)`.
    useMedia: jest.fn(() => ({})),
  };

  return mockExports;
});

// Mock Tamagui Lucide Icons
jest.mock('@tamagui/lucide-icons', () => {
  const React = require('react');

  const ICON_NON_DOM = new Set([
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
    'pointerEvents',
    'width',
    'height',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
  ]);
  function stripIconProps(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!ICON_NON_DOM.has(key) && !key.startsWith('$'))
        clean[key] = props[key];
    }
    return clean;
  }

  const createMockIcon = (name) => {
    const Component = ({ size = 16, color, strokeWidth, ...props }) => {
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color || 'currentColor',
        strokeWidth: strokeWidth || 2,
        'data-testid': `${name}Icon`,
        ...stripIconProps(props),
      });
    };
    Component.displayName = name;
    return Component;
  };

  const iconExports = {
    ArrowUpDown: createMockIcon('ArrowUpDown'),
    ChevronDown: createMockIcon('ChevronDown'),
    RefreshCw: createMockIcon('RefreshCw'),
    Search: createMockIcon('Search'),
    Tag: createMockIcon('Tag'),
    User: createMockIcon('User'),
    X: createMockIcon('X'),
    Plus: createMockIcon('Plus'),
    Minus: createMockIcon('Minus'),
    Check: createMockIcon('Check'),
    ArrowLeft: createMockIcon('ArrowLeft'),
    ArrowRight: createMockIcon('ArrowRight'),
    ChevronUp: createMockIcon('ChevronUp'),
    ChevronLeft: createMockIcon('ChevronLeft'),
    Lock: createMockIcon('Lock'),
    Info: createMockIcon('Info'),
    ChevronRight: createMockIcon('ChevronRight'),
    Users: createMockIcon('Users'),
    ArrowLeftRight: createMockIcon('ArrowLeftRight'),
    EllipsisVertical: createMockIcon('EllipsisVertical'),
    Calendar: createMockIcon('Calendar'),
    Settings: createMockIcon('Settings'),
    Sort: createMockIcon('Sort'),
    Filter: createMockIcon('Filter'),
    BookOpen: createMockIcon('BookOpen'),
    Star: createMockIcon('Star'),
    Trophy: createMockIcon('Trophy'),
    CheckCircle2: createMockIcon('CheckCircle2'),
    Circle: createMockIcon('Circle'),
    Hourglass: createMockIcon('Hourglass'),
    // Icons used by PendingTradeOffers / PendingWaiverClaims
    AlertTriangle: createMockIcon('AlertTriangle'),
    Clock: createMockIcon('Clock'),
    DollarSign: createMockIcon('DollarSign'),
    // Icons used by MatchupScoreboardView
    Swords: createMockIcon('Swords'),
    Activity: createMockIcon('Activity'),
    TrendingUp: createMockIcon('TrendingUp'),
    // Icons used by MatchupCard status badge
    CheckCircle: createMockIcon('CheckCircle'),
    XCircle: createMockIcon('XCircle'),
    Send: createMockIcon('Send'),
    Trash2: createMockIcon('Trash2'),
    Award: createMockIcon('Award'),
    // Icons used by TradingCenter (LS-8852)
    History: createMockIcon('History'),
    MessageSquare: createMockIcon('MessageSquare'),
    Shield: createMockIcon('Shield'),
    Zap: createMockIcon('Zap'),
    // Icons used by DraftBottomNav (LS-9397)
    ClipboardList: createMockIcon('ClipboardList'),
    LayoutGrid: createMockIcon('LayoutGrid'),
    List: createMockIcon('List'),
    MessageCircle: createMockIcon('MessageCircle'),
    // Icon used by DraftPacketSection's download button (LS-9750)
    Download: createMockIcon('Download'),
    Badge: (() => {
      const Component = ({
        size = 16,
        color,
        strokeWidth,
        children,
        ...props
      }) =>
        React.createElement(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: color || 'currentColor',
            strokeWidth: strokeWidth || 2,
            'data-testid': 'BadgeIcon',
            ...stripIconProps(props),
          },
          children,
        );
      Component.displayName = 'Badge';
      return Component;
    })(),
  };

  return iconExports;
});

jest.mock('@tamagui/select', () => {
  const React = require('react');

  const SELECT_NON_DOM = new Set([
    'onPress',
    'onPressIn',
    'onPressOut',
    'onValueChange',
    'onOpenChange',
    'accessibilityLabel',
    'accessibilityRole',
    'testID',
    'size',
    'unstyled',
    'chromeless',
    'active',
    'animation',
    'pressStyle',
    'hoverStyle',
    'focusStyle',
    'enterStyle',
    'exitStyle',
    'themeInverse',
    'elevate',
    'bordered',
    'circular',
    'backgroundColor',
    'borderRadius',
    'borderColor',
    'borderWidth',
    'paddingVertical',
    'paddingHorizontal',
    'marginVertical',
    'marginHorizontal',
    'maxWidth',
    'minWidth',
    'maxHeight',
    'minHeight',
    'textTransform',
    'pointerEvents',
  ]);
  function filterSelectProps(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!SELECT_NON_DOM.has(key) && !key.startsWith('$'))
        clean[key] = props[key];
    }
    return clean;
  }

  const createSelectComponent = (name, defaultElement = 'div') => {
    const Component = ({ children, ...props }) => {
      return React.createElement(
        defaultElement,
        filterSelectProps(props),
        children,
      );
    };
    Component.displayName = name;
    return Component;
  };

  // Create Select with nested components
  const Select = createSelectComponent('Select');
  Select.Trigger = createSelectComponent('Select.Trigger', 'button');
  Select.Content = createSelectComponent('Select.Content', 'div');
  Select.Viewport = createSelectComponent('Select.Viewport', 'div');
  Select.Item = createSelectComponent('Select.Item', 'option');
  Select.ItemText = createSelectComponent('Select.ItemText', 'span');
  Select.Icon = createSelectComponent('Select.Icon', 'span');
  Select.ScrollUpButton = createSelectComponent(
    'Select.ScrollUpButton',
    'button',
  );
  Select.ScrollDownButton = createSelectComponent(
    'Select.ScrollDownButton',
    'button',
  );
  Select.Group = createSelectComponent('Select.Group', 'div');
  Select.Label = createSelectComponent('Select.Label', 'label');
  Select.ItemIndicator = createSelectComponent('Select.ItemIndicator', 'span');
  Select.Adapt = createSelectComponent('Select.Adapt', 'div');
  Select.Value = ({ children, placeholder, ...props }) => {
    return React.createElement(
      'span',
      filterSelectProps(props),
      children || placeholder || 'Select...',
    );
  };
  Select.Value.displayName = 'Select.Value';

  // Create Sheet components for mobile select behavior
  const Sheet = createSelectComponent('Sheet');
  Sheet.Frame = createSelectComponent('Sheet.Frame', 'div');
  Sheet.ScrollView = createSelectComponent('Sheet.ScrollView', 'div');
  Sheet.Handle = createSelectComponent('Sheet.Handle', 'div');
  Sheet.Overlay = createSelectComponent('Sheet.Overlay', 'div');

  return { Select, Sheet };
});

// Mock Tamagui theme and config
jest.mock('@tamagui/config', () => ({
  config: {
    themes: {
      light: {},
      dark: {},
    },
    tokens: {},
  },
}));

// Global React Native components are now defined in the main react-native mock above

// Mock UsefulTables components globally for mobile
jest.mock('./src/features/stats/UsefulTables', () => {
  const React = require('react');

  const TABLE_NON_DOM = new Set([
    'onPress',
    'onPressIn',
    'onPressOut',
    'accessibilityLabel',
    'testID',
    'backgroundColor',
    'borderRadius',
    'paddingVertical',
    'paddingHorizontal',
    'marginVertical',
    'marginHorizontal',
    'maxWidth',
    'minWidth',
    'active',
    'textTransform',
    'size',
    'unstyled',
    'pointerEvents',
  ]);

  const createMockTableComponent = (name) => {
    const Component = (props) => {
      const filtered = { 'data-testid': name };
      for (const key of Object.keys(props)) {
        if (!TABLE_NON_DOM.has(key) && !key.startsWith('$'))
          filtered[key] = props[key];
      }
      return React.createElement('div', filtered, name);
    };
    Component.displayName = name;
    return Component;
  };

  return {
    BattingStatsTableWithData: createMockTableComponent(
      'BattingStatsTableWithData',
    ),
    PitchingStatsTableWithData: createMockTableComponent(
      'PitchingStatsTableWithData',
    ),
    FieldingStatsTableWithData: createMockTableComponent(
      'FieldingStatsTableWithData',
    ),
  };
});

global.Text = (() => {
  const NON_DOM = new Set([
    'onPress',
    'onPressIn',
    'onPressOut',
    'numberOfLines',
    'ellipsizeMode',
    'textTransform',
    'selectable',
    'adjustsFontSizeToFit',
    'allowFontScaling',
    'minimumFontScale',
    'accessibilityLabel',
    'accessibilityRole',
    'testID',
    'active',
    'color',
    'fontWeight',
    'fontSize',
    'lineHeight',
    'fontFamily',
    'letterSpacing',
  ]);
  return ({ children, ...props }) => {
    const React = require('react');
    const filtered = {};
    for (const key of Object.keys(props)) {
      if (!NON_DOM.has(key) && !key.startsWith('$')) filtered[key] = props[key];
    }
    return React.createElement('span', filtered, children);
  };
})();

global.ScrollView = (() => {
  const NON_DOM = new Set([
    'showsVerticalScrollIndicator',
    'showsHorizontalScrollIndicator',
    'bounces',
    'scrollEnabled',
    'pagingEnabled',
    'horizontal',
    'vertical',
    'contentContainerStyle',
    'stickyHeaderIndices',
    'scrollEventThrottle',
    'onPress',
    'accessibilityLabel',
    'testID',
    'active',
    'pointerEvents',
  ]);
  return ({ children, ...props }) => {
    const React = require('react');
    const filtered = {};
    for (const key of Object.keys(props)) {
      if (!NON_DOM.has(key) && !key.startsWith('$')) filtered[key] = props[key];
    }
    return React.createElement(
      'div',
      { style: { overflow: 'auto' }, ...filtered },
      children,
    );
  };
})();

global.TextInput = (() => {
  const NON_DOM = new Set([
    'onSubmitEditing',
    'keyboardType',
    'returnKeyType',
    'secureTextEntry',
    'placeholderTextColor',
    'editable',
    'multiline',
    'numberOfLines',
    'textTransform',
    'accessibilityLabel',
    'testID',
    'active',
    'onPressIn',
    'onPressOut',
    'onPress',
    'unstyled',
  ]);
  return ({ onChangeText, value, placeholder, ...props }) => {
    const React = require('react');
    const filtered = {};
    for (const key of Object.keys(props)) {
      if (!NON_DOM.has(key) && !key.startsWith('$')) filtered[key] = props[key];
    }
    return React.createElement('input', {
      onChange: (e) => onChangeText?.(e.target.value),
      value,
      placeholder,
      ...filtered,
    });
  };
})();

// Mock Tamagui config
jest.mock('@legacy-sports/tamagui-config', () => ({
  config: {},
  // LS-9035: football playboard-hero theme-invariant palette — see the
  // `playboardTokens` export in lib/tamagui-config/src/lib/tamagui-config.ts.
  playboardTokens: {
    bgTop: '#1B2A24',
    bgBottom: '#101A16',
    boardBackgroundImage: '',
    boardShadow: '',
    boardShadowHover: '',
    border: '#2C3D34',
    liveMint: '#8FD6A2',
    textSecondary: '#93A89A',
    textMeta: '#7D9284',
    textPrimary: '#EEF4EA',
    dashedInsetBorder: 'rgba(238,244,234,.16)',
    buttonBorder: '#5FA36C',
    buttonHover: '#377C46',
    buttonText: '#F2F7F1',
    bug: {
      chromeLight: '#DCE3D8',
      chromeDark: '#4C5849',
      badgeTop: '#2F6B3C',
      badgeBottom: '#143021',
      badgeEyeText: '#F2F6FA',
      innerBorder: '#10192A',
      plateTop: '#3C8450',
      plateBottom: '#1B4527',
      bottomLight: '#A3AE9D',
      bottomDark: '#5F6B5B',
      textOnChrome: '#F4F8FC',
      textOnBottomBar: '#111A12',
      leadGold: '#F3DD8B',
      possessionGold: '#F5D96A',
    },
  },
}));

// Mock @tamagui/config base
jest.mock('@tamagui/config/v3', () => ({
  config: {},
}));
