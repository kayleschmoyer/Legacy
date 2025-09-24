// Set up testing library
import '@testing-library/jest-dom';

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

  const createMockComponent = (name, defaultElement = 'div') => {
    const Component = ({ children, ...props }) => {
      return React.createElement(defaultElement, props, children);
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
    TouchableOpacity: ({ children, onPress, ...props }) => {
      return React.createElement(
        'button',
        { onClick: onPress, ...props },
        children,
      );
    },
    Image: createMockComponent('Image', 'img'),
    TextInput: createMockComponent('TextInput', 'input'),
    SafeAreaView: createMockComponent('SafeAreaView', 'div'),
  };
});

// Mock React Native Picker
jest.mock('@react-native-picker/picker', () => ({
  Picker: ({ children, onValueChange, selectedValue, ...props }) => {
    const React = require('react');
    return React.createElement(
      'select',
      {
        onChange: (e) => onValueChange?.(e.target.value),
        value: selectedValue,
        ...props,
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

// Mock Tamagui components for mobile environment - avoid displayName issues
jest.mock('tamagui', () => {
  const React = require('react');

  const createMockComponent = (name, defaultElement = 'div') => {
    const Component = React.forwardRef(({ children, ...props }, ref) => {
      // Filter out Tamagui-specific props that HTML elements don't understand
      const {
        // Layout props
        f,
        flex,
        flexDirection,
        flexWrap,
        alignItems,
        justifyContent,
        alignSelf,
        p,
        padding,
        pt,
        pr,
        pb,
        pl,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        m,
        margin,
        mt,
        mr,
        mb,
        ml,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        w,
        width,
        h,
        height,
        maxWidth,
        maxHeight,
        minWidth,
        minHeight,
        // Color/style props
        bg,
        backgroundColor,
        color,
        borderColor,
        borderWidth,
        borderRadius,
        // Position props
        position,
        top,
        right,
        bottom,
        left,
        zIndex,
        // Animation props
        animation,
        animateOnly,
        enterStyle,
        exitStyle,
        hoverStyle,
        pressStyle,
        // Other Tamagui props
        theme,
        themeInverse,
        debug,
        group,
        tag,
        space,
        spaceDirection,
        // Keep valid HTML props
        ...htmlProps
      } = props;

      return React.createElement(
        defaultElement,
        { ref, ...htmlProps },
        children,
      );
    });
    Component.displayName = name;
    return Component;
  };

  const createMockButton = (name = 'Button') => {
    const Component = ({
      children,
      onPress,
      icon,
      iconAfter,
      size,
      variant,
      disabled,
      ...props
    }) => {
      // Filter out Tamagui-specific props that HTML button doesn't understand
      const { p, m, bg, color, borderRadius, ...htmlProps } = props;

      return React.createElement(
        'button',
        {
          onClick: onPress,
          disabled,
          'data-variant': variant,
          'data-size': size,
          ...htmlProps,
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
    };
    Component.displayName = name;
    return Component;
  };

  const createMockInput = (name = 'Input') => {
    const Component = ({ onChangeText, value, placeholder, ...props }) => {
      return React.createElement('input', {
        onChange: (e) => onChangeText?.(e.target.value),
        value,
        placeholder,
        ...props,
      });
    };
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
    Card: ({ children, onPress, onPressIn, onPressOut, ...props }) => {
      return React.createElement(
        'div',
        {
          onClick: onPress,
          onMouseDown: onPressIn,
          onMouseUp: onPressOut,
          ...props,
        },
        children,
      );
    },
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
