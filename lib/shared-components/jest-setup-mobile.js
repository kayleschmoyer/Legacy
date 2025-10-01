// Set up testing library
import '@testing-library/jest-dom';

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

  const createMockComponent = (name, defaultElement = 'div') => {
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
        if (!reactNativeProps.has(key)) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(
        'button',
        { onClick: onPress, ...filteredProps },
        children,
      );
    },
    Image: createMockComponent('Image', 'img'),
    TextInput: createMockComponent('TextInput', 'input'),
    SafeAreaView: createMockComponent('SafeAreaView', 'div'),
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
  };
});

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
    FlatList: createMockComponent('FlatList'),
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

  const createMockComponent = (name, defaultElement = 'div') => {
    const Component = React.forwardRef(({ children, ...props }, ref) => {
      // Filter out React Native specific props
      const filteredProps = {};
      for (const [key, value] of Object.entries(props)) {
        if (!reactNativeProps.has(key)) {
          filteredProps[key] = value;
        }
      }
      return React.createElement(
        defaultElement,
        { ref, ...filteredProps },
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
        // Filter out React Native specific props
        const filteredProps = {};
        for (const [key, value] of Object.entries(props)) {
          if (!reactNativeProps.has(key)) {
            filteredProps[key] = value;
          }
        }

        return React.createElement(
          'button',
          {
            ref,
            onClick: onPress,
            disabled,
            'data-variant': variant,
            'data-size': size,
            ...filteredProps,
          },
          [
            // Render icon before text if provided
            icon && React.createElement(icon, { key: 'icon', size: 16 }),
            // Render children (text)
            children,
            // Render icon after text if provided
            iconAfter &&
              React.createElement(iconAfter, { key: 'iconAfter', size: 16 }),
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
        // Filter out React Native specific props
        const filteredProps = {};
        for (const [key, value] of Object.entries(props)) {
          if (!reactNativeProps.has(key)) {
            filteredProps[key] = value;
          }
        }

        return React.createElement('input', {
          ref,
          onChange: (e) => onChangeText?.(e.target.value),
          value,
          placeholder,
          ...filteredProps,
        });
      },
    );
    Component.displayName = name;
    return Component;
  };

  const mockExports = {
    styled: jest.fn((Component) => Component),
    Stack: createMockComponent('Stack', 'div'),
    YStack: createMockComponent('YStack', 'div'),
    XStack: createMockComponent('XStack', 'div'),
    Text: createMockComponent('Text', 'span'),
    H2: createMockComponent('H2', 'h2'),
    H4: createMockComponent('H4', 'h4'),
    Button: createMockButton('Button'),
    Card: React.forwardRef(
      ({ children, onPress, onPressIn, onPressOut, ...props }, ref) => {
        // Filter out React Native specific props
        const filteredProps = {};
        for (const [key, value] of Object.entries(props)) {
          if (!reactNativeProps.has(key)) {
            filteredProps[key] = value;
          }
        }

        return React.createElement(
          'div',
          {
            ref,
            onClick: onPress,
            onMouseDown: onPressIn,
            onMouseUp: onPressOut,
            ...filteredProps,
          },
          children,
        );
      },
    ),
    ScrollView: createMockComponent('ScrollView', 'div'),
    Separator: createMockComponent('Separator', 'hr'),
    Input: createMockInput('Input'),
    Spinner: createMockComponent('Spinner', 'div'),
    View: createMockComponent('View', 'div'),
    Select: (() => {
      const createSelectComponent = (name, defaultElement = 'div') => {
        const Component = ({ children, ...props }) => {
          return React.createElement(defaultElement, props, children);
        };
        Component.displayName = name;
        return Component;
      };

      const Select = createSelectComponent('Select');
      Select.Trigger = ({ children, iconAfter, width, ...props }) => {
        return React.createElement(
          'button',
          {
            style: { width },
            ...props,
          },
          [
            children,
            iconAfter &&
              React.createElement(iconAfter, { key: 'iconAfter', size: 16 }),
          ],
        );
      };
      Select.Trigger.displayName = 'Select.Trigger';
      Select.Content = createSelectComponent('Select.Content', 'div');
      Select.Viewport = createSelectComponent('Select.Viewport', 'div');
      Select.Item = createSelectComponent('Select.Item', 'div');
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
      Select.ItemIndicator = createSelectComponent(
        'Select.ItemIndicator',
        'span',
      );
      Select.Adapt = ({ children, platform, ...props }) => {
        // For testing, always render children regardless of platform
        return React.createElement('div', props, children);
      };
      Select.Adapt.displayName = 'Select.Adapt';
      Select.Value = ({ children, placeholder, ...props }) => {
        return React.createElement(
          'span',
          props,
          children || placeholder || 'Select...',
        );
      };
      Select.Value.displayName = 'Select.Value';

      return Select;
    })(),
    Sheet: (() => {
      const createSelectComponent = (name, defaultElement = 'div') => {
        const Component = ({ children, ...props }) => {
          return React.createElement(defaultElement, props, children);
        };
        Component.displayName = name;
        return Component;
      };

      const Sheet = ({ children, modal, dismissOnSnapToBottom, ...props }) => {
        return React.createElement('div', props, children);
      };
      Sheet.displayName = 'Sheet';
      Sheet.Frame = createSelectComponent('Sheet.Frame', 'div');
      Sheet.ScrollView = createSelectComponent('Sheet.ScrollView', 'div');
      Sheet.Handle = createSelectComponent('Sheet.Handle', 'div');
      Sheet.Overlay = createSelectComponent('Sheet.Overlay', 'div');

      return Sheet;
    })(),
  };

  return mockExports;
});

// Mock Tamagui Lucide Icons
jest.mock('@tamagui/lucide-icons', () => {
  const React = require('react');

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
        ...props,
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
    ChevronRight: createMockIcon('ChevronRight'),
  };

  return iconExports;
});

jest.mock('@tamagui/select', () => {
  const React = require('react');

  const createSelectComponent = (name, defaultElement = 'div') => {
    const Component = ({ children, ...props }) => {
      return React.createElement(defaultElement, props, children);
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
      props,
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

  const createMockTableComponent = (name) => {
    const Component = (props) =>
      React.createElement('div', { 'data-testid': name, ...props }, name);
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

global.Text = ({ children, ...props }) => {
  const React = require('react');
  return React.createElement('span', props, children);
};

global.ScrollView = ({ children, ...props }) => {
  const React = require('react');
  return React.createElement(
    'div',
    { style: { overflow: 'auto' }, ...props },
    children,
  );
};

global.TextInput = ({ onChangeText, value, placeholder, ...props }) => {
  const React = require('react');
  return React.createElement('input', {
    onChange: (e) => onChangeText?.(e.target.value),
    value,
    placeholder,
    ...props,
  });
};

// Mock Tamagui config
jest.mock('@legacy-sports/tamagui-config', () => ({
  config: {},
}));

// Mock @tamagui/config base
jest.mock('@tamagui/config/v3', () => ({
  config: {},
}));
