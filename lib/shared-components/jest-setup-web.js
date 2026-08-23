// Web-specific Jest setup - using CommonJS for Jest compatibility
require('@testing-library/jest-dom');

// Mock @legacy-sports/tamagui-config — the real module pulls in @tamagui/config
// (font-silkscreen etc.), which throws under Jest ("createFont is not a
// function"). Mirrors the mobile jest-setup-mobile.js mock (LS-9035).
jest.mock('@legacy-sports/tamagui-config', () => ({
  config: {},
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
    this.cb([{ borderBoxSize: [{ inlineSize: 0, blockSize: 0 }] }]);
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

  // Strip React-Native/Tamagui props that aren't valid DOM attributes
  const RN_PROPS = new Set([
    'onPressIn',
    'onPressOut',
    'onPress',
    'onSubmitEditing',
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
  ]);
  function stripRNProps(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      // Strip known non-DOM props and $-prefixed Tamagui breakpoint props
      if (!RN_PROPS.has(key) && !key.startsWith('$')) clean[key] = props[key];
    }
    return clean;
  }

  const Platform = {
    OS: 'web',
    // Accessed via `global`: jest >= 30.4 no longer allowlists the bare
    // `navigator` global inside jest.mock() factories (babel-plugin-jest-hoist),
    // and this file's ESLint env (node) does not define `globalThis`.
    Version:
      typeof global.navigator !== 'undefined'
        ? global.navigator.userAgent
        : undefined,
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
      React.createElement('span', stripRNProps(props), children),
    View: ({ children, ...props }) =>
      React.createElement('div', stripRNProps(props), children),
    TouchableOpacity: ({ children, onPress, ...props }) =>
      React.createElement(
        'button',
        { onClick: onPress, ...stripRNProps(props) },
        children,
      ),
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => style,
    },
    Modal: ({ children, visible, ...props }) =>
      visible
        ? React.createElement('div', stripRNProps(props), children)
        : null,
    Animated: {
      View: ({ children, ...props }) =>
        React.createElement('div', stripRNProps(props), children),
      Text: ({ children, ...props }) =>
        React.createElement('span', stripRNProps(props), children),
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
      React.createElement('table', stripRNProps(props), children),
    FlatList: ({ data, renderItem, ...props }) => {
      if (!data || !renderItem)
        return React.createElement('div', stripRNProps(props));
      return React.createElement(
        'div',
        stripRNProps(props),
        data.map((item, index) => renderItem({ item, index })),
      );
    },
    ScrollView: ({ children, ...props }) =>
      React.createElement('div', stripRNProps(props), children),
    SafeAreaView: ({ children, ...props }) =>
      React.createElement('div', stripRNProps(props), children),
    KeyboardAvoidingView: ({ children, ...props }) =>
      React.createElement('div', stripRNProps(props), children),
    TextInput: ({
      onChangeText,
      editable,
      value,
      onSubmitEditing: _onSubmitEditing,
      keyboardType: _kt,
      ...props
    }) => {
      return React.createElement('input', {
        ...stripRNProps(props),
        onChange: onChangeText
          ? (e) => onChangeText(e.target.value)
          : props.onChange,
        readOnly: editable === false,
        defaultValue: value !== undefined && !onChangeText ? value : undefined,
        value: onChangeText ? value : undefined,
      });
    },
    Image: (props) => React.createElement('img', stripRNProps(props)),
    Pressable: ({ children, onPress, ...props }) =>
      React.createElement(
        'button',
        { onClick: onPress, ...stripRNProps(props) },
        children,
      ),
    ActivityIndicator: (props) =>
      React.createElement('div', stripRNProps(props), 'Loading...'),
    Picker: ({ children, ...props }) =>
      React.createElement('select', stripRNProps(props), children),
    Vibration: {
      vibrate: jest.fn(),
      cancel: jest.fn(),
    },
    Alert: {
      alert: jest.fn(),
    },
    Icon: ({ children, ...props }) =>
      React.createElement('i', stripRNProps(props), children),
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
jest.mock('react-native', () => {
  const React = require('react');

  // Same prop set used by platform-components – avoids leaking RN/Tamagui
  // style props to DOM elements when components import directly from react-native.
  const RN_NON_DOM = new Set([
    'onPress',
    'onPressIn',
    'onPressOut',
    'onSubmitEditing',
    'onOpenChange',
    'onValueChange',
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
    'active',
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
    'modal',
    'open',
    'snapPoints',
    'dismissOnSnapToBottom',
  ]);
  function stripRN(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!RN_NON_DOM.has(key) && !key.startsWith('$')) clean[key] = props[key];
    }
    return clean;
  }

  return {
    Platform: {
      OS: 'web',
      select: (obj) => obj.web || obj.default || obj.ios,
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 1024, height: 768 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    useWindowDimensions: jest.fn(() => ({
      width: 1024,
      height: 768,
      scale: 1,
      fontScale: 1,
    })),
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => style,
      compose: (...styles) => Object.assign({}, ...styles),
    },
    Touchable: {
      Mixin: {}, // Mock for react-native-svg compatibility
    },
    processColor: jest.fn((color) => color), // Mock for react-native-svg
    View: ({ children, ...props }) =>
      React.createElement('div', stripRN(props), children),
    Text: ({ children, ...props }) =>
      React.createElement('span', stripRN(props), children),
    TouchableOpacity: ({ children, onPress, ...props }) =>
      React.createElement(
        'button',
        { onClick: onPress, ...stripRN(props) },
        children,
      ),
    Pressable: ({ children, onPress, ...props }) =>
      React.createElement(
        'button',
        { onClick: onPress, ...stripRN(props) },
        typeof children === 'function'
          ? children({ pressed: false })
          : children,
      ),
    ScrollView: ({ children, ...props }) =>
      React.createElement('div', stripRN(props), children),
    ActivityIndicator: (props) =>
      React.createElement('div', stripRN(props), 'Loading...'),
    TextInput: ({ onChangeText, value, placeholder, ...props }) =>
      React.createElement('input', {
        ...stripRN(props),
        onChange: onChangeText
          ? (e) => onChangeText(e.target.value)
          : undefined,
        value,
        placeholder,
      }),
    FlatList: ({ data, renderItem, ...props }) =>
      React.createElement(
        'div',
        stripRN(props),
        data && renderItem
          ? data.map((item, index) => renderItem({ item, index }))
          : null,
      ),
  };
});

// Make StyleSheet available globally for react-native-svg
global.StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
  compose: (...styles) => Object.assign({}, ...styles),
};

// Mock react-native-svg completely
jest.mock('react-native-svg', () => {
  const React = require('react');

  // SVG elements accept a different set of attributes than HTML elements,
  // but React-Native-specific props should still be stripped.
  const SVG_NON_DOM = new Set([
    'testID',
    'accessibilityLabel',
    'accessibilityRole',
    'accessibilityState',
    'accessibilityHint',
    'accessibilityValue',
    'onPress',
    'onPressIn',
    'onPressOut',
    'hitSlop',
    'pointerEvents',
  ]);
  function stripSvgNonDOMProps(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!SVG_NON_DOM.has(key) && !key.startsWith('$'))
        clean[key] = props[key];
    }
    return clean;
  }

  // Create a generic SVG component factory
  const createSvgComponent = (tagName) => {
    return ({ children, ...props }) =>
      React.createElement(tagName, stripSvgNonDOMProps(props), children);
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

  // Safe passthrough stub for LS-9014's tamagui-config.ts createTokens()
  // override — specs mocking 'tamagui' don't need real token merging.
  const createTokens = (tokens) => tokens;

  // Strip Tamagui/React-Native-specific behavior/config props that aren't
  // valid DOM attributes or CSS style values. Layout/style props are NOT
  // here — STYLE_PROPS below forwards them into a real `style` object
  // instead of dropping them (LS-9459).
  const NON_DOM_PROPS = new Set([
    'modal',
    'open',
    'onOpenChange',
    'snapPoints',
    'dismissOnSnapToBottom',
    'snapPointsMode',
    'horizontal',
    'onPressIn',
    'onPressOut',
    'onPress',
    'onSubmitEditing',
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
    'accessibilityLabel',
    'accessibilityRole',
    'accessibilityState',
    'accessibilityHint',
    'accessibilityValue',
    'keyboardType',
    'testID',
    'numberOfLines',
    'ellipsizeMode',
    'selectable',
    'adjustsFontSizeToFit',
    'allowFontScaling',
    'minimumFontScale',
    'hitSlop',
    'pressRetentionOffset',
    'showsHorizontalScrollIndicator',
    'showsVerticalScrollIndicator',
    'contentContainerStyle',
    'pointerEvents',
    'active',
    // RN value is an array of strings (e.g. ['small-caps']), not a valid CSS
    // style value — unsafe to forward as-is.
    'fontVariant',
    // RN shadow + transform shorthand props used by the ticket/glass surfaces
    // (LS-9034/LS-9048) — RN-only shapes (e.g. shadowOffset is an object)
    // with no safe 1:1 CSS style-object translation, so left dropped rather
    // than forwarded.
    'shadowColor',
    'shadowOffset',
    'shadowRadius',
    'rotate',
  ]);

  // Layout/style props Tamagui accepts as shorthand — forwarded into a real
  // `style` object (rather than dropped) so `toHaveStyle` assertions observe
  // what the component actually set. Values are numbers or CSS-value
  // strings; React DOM auto-appends `px` to non-unitless numeric style
  // properties (e.g. `paddingTop: 44` renders as `padding-top: 44px`), so no
  // manual unit conversion is needed here.
  const STYLE_PROPS = new Set([
    'backgroundColor',
    'borderRadius',
    'borderColor',
    'borderWidth',
    'textTransform',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
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
    'cursor',
    'position',
    'zIndex',
    'flexShrink',
    'flexGrow',
    'flexBasis',
    'flexWrap',
    'alignSelf',
    'borderStyle',
    'borderTopWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderRightWidth',
    'borderTopColor',
    'borderBottomColor',
    'borderLeftColor',
    'borderRightColor',
    'fontStyle',
  ]);

  // RN shorthand props with no 1:1 CSS property — expand to the per-edge
  // longhands STYLE_PROPS already understands.
  const STYLE_SHORTHAND_EXPANSIONS = {
    paddingHorizontal: ['paddingLeft', 'paddingRight'],
    paddingVertical: ['paddingTop', 'paddingBottom'],
    marginHorizontal: ['marginLeft', 'marginRight'],
    marginVertical: ['marginTop', 'marginBottom'],
  };

  function stripNonDOMProps(props = {}) {
    const clean = {};
    const style = {};
    let hasStyle = false;
    for (const key of Object.keys(props)) {
      // Strip $-prefixed Tamagui breakpoint props; `style` is merged below,
      // after shorthand expansion, so an explicit style prop wins.
      if (key.startsWith('$') || key === 'style') continue;
      if (STYLE_PROPS.has(key)) {
        style[key] = props[key];
        hasStyle = true;
      } else if (STYLE_SHORTHAND_EXPANSIONS[key]) {
        for (const longhand of STYLE_SHORTHAND_EXPANSIONS[key]) {
          style[longhand] = props[key];
        }
        hasStyle = true;
      } else if (!NON_DOM_PROPS.has(key)) {
        clean[key] = props[key];
      }
    }
    if (hasStyle || props.style) {
      clean.style = { ...style, ...props.style };
    }
    // Surface testID as the DOM attribute React Testing Library queries, so
    // *ByTestId works against the mocked primitives the way it does against
    // real Tamagui on web. The accessibility pair is mirrored to inert `data-*`
    // attributes rather than `role`/`aria-label` so no `*ByRole` or
    // `*ByLabelText` query anywhere else changes meaning (LS-8800).
    if (props.testID != null) clean['data-testid'] = props.testID;
    if (props.accessibilityRole != null)
      clean['data-accessibility-role'] = props.accessibilityRole;
    if (props.accessibilityLabel != null)
      clean['data-accessibility-label'] = props.accessibilityLabel;
    return clean;
  }

  return {
    createTokens,
    TamaguiProvider: ({ children }) => React.createElement('div', {}, children),
    // Theme is a token-scoping wrapper with no DOM footprint of its own —
    // passthrough (needed by e.g. BrandedSplash / AnimatedLaunchScreen).
    Theme: ({ children }) => children,
    useTheme: () => ({
      background: 'white',
      color: 'black',
      borderColor: 'gray',
      backgroundColor: 'white',
    }),
    // Matches the mobile mock — useThemeTokens() (lib/shared-components/src/hooks)
    // calls this on both platforms.
    useThemeName: jest.fn(() => 'dark'),
    YStack: ({ children, onPress, onPressIn, onPressOut, ...props }) =>
      React.createElement(
        'div',
        {
          ...stripNonDOMProps(props),
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
          ...stripNonDOMProps(props),
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
          ...stripNonDOMProps(domProps),
          onClick: onPress,
        },
        children,
      );
    },
    Input: ({
      onChangeText,
      editable,
      value,
      unstyled,
      onSubmitEditing: _onSubmitEditing,
      ...props
    }) => {
      return React.createElement('input', {
        ...stripNonDOMProps(props),
        onChange: onChangeText
          ? (e) => onChangeText(e.target.value)
          : props.onChange,
        readOnly: editable === false,
        defaultValue:
          value !== undefined && !onChangeText && !props.onChange
            ? value
            : undefined,
        value: onChangeText || props.onChange ? value : undefined,
      });
    },
    TextArea: ({
      onChangeText,
      editable,
      value,
      unstyled,
      onSubmitEditing: _onSubmitEditing,
      ...props
    }) => {
      return React.createElement('textarea', {
        ...stripNonDOMProps(props),
        onChange: onChangeText
          ? (e) => onChangeText(e.target.value)
          : props.onChange,
        readOnly: editable === false,
        defaultValue:
          value !== undefined && !onChangeText && !props.onChange
            ? value
            : undefined,
        value: onChangeText || props.onChange ? value : undefined,
      });
    },
    Text: ({ children, onPress, onPressIn, onPressOut, ...props }) =>
      React.createElement(
        'span',
        {
          ...stripNonDOMProps(props),
          onClick: onPress,
          onMouseDown: onPressIn,
          onMouseUp: onPressOut,
        },
        children,
      ),
    H1: ({ children, ...props }) =>
      React.createElement('h1', stripNonDOMProps(props), children),
    H2: ({ children, ...props }) =>
      React.createElement('h2', stripNonDOMProps(props), children),
    H3: ({ children, ...props }) =>
      React.createElement('h3', stripNonDOMProps(props), children),
    H4: ({ children, ...props }) =>
      React.createElement('h4', stripNonDOMProps(props), children),
    Paragraph: ({ children, ...props }) =>
      React.createElement('p', stripNonDOMProps(props), children),
    ScrollView: ({ children, horizontal: _horizontal, ...props }) =>
      React.createElement('div', stripNonDOMProps(props), children),
    Card: Object.assign(
      ({ children, onPress, onPressIn, onPressOut, testID, ...props }) => {
        const { pressStyle, ...rest } = props;
        return React.createElement(
          'div',
          {
            ...stripNonDOMProps(rest),
            onClick: onPress,
            onMouseDown: onPressIn,
            onMouseUp: onPressOut,
            'data-testid': testID,
          },
          children,
        );
      },
      {
        Header: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Footer: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
      },
    ),
    Anchor: ({ children, ...props }) =>
      React.createElement('a', stripNonDOMProps(props), children),
    Image: ({ source, ...props }) =>
      React.createElement('img', {
        ...stripNonDOMProps(props),
        src: source?.uri,
      }),
    Spinner: ({ ...props }) =>
      React.createElement('div', stripNonDOMProps(props), 'Loading...'),
    Separator: ({ ...props }) =>
      React.createElement('hr', stripNonDOMProps(props)),
    Checkbox: Object.assign(
      ({ children, checked, onCheckedChange, onPress, ...props }) =>
        React.createElement(
          'button',
          {
            ...stripNonDOMProps(props),
            role: 'checkbox',
            'aria-checked': !!checked,
            onClick: (e) => {
              onPress?.(e);
              onCheckedChange?.(!checked);
            },
          },
          checked ? children : null,
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
        // Scan direct children for an aria-label (Select.Trigger carries it).
        let ariaLabel = rootAriaLabel;
        React.Children.forEach(children, (child) => {
          if (child && child.props && child.props['aria-label'] && !ariaLabel) {
            ariaLabel = child.props['aria-label'];
          }
        });
        return React.createElement(
          'select',
          {
            ...stripNonDOMProps(props),
            value,
            'aria-label': ariaLabel || undefined,
            onChange: (e) => onValueChange?.(e.target.value),
          },
          children,
        );
      },
      {
        // Trigger passes through children so Select.Value renders a placeholder
        // <option> inside the <select>. Does not render a visible button.
        Trigger: ({ children }) =>
          React.createElement(React.Fragment, null, children),
        // Renders a disabled placeholder option shown when value is empty.
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
        // Transparent pass-throughs so <option> elements reach the <select>.
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
          React.createElement('label', stripNonDOMProps(props), children),
      },
    ),
    Sheet: Object.assign(
      ({
        children,
        modal: _m,
        open: _o,
        onOpenChange: _oc,
        snapPoints: _sp,
        dismissOnSnapToBottom: _d,
        ...props
      }) => React.createElement('div', stripNonDOMProps(props), children),
      {
        Frame: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        ScrollView: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Handle: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Overlay: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
      },
    ),
    Dialog: Object.assign(
      ({ children, open, onOpenChange, ...props }) =>
        open !== false
          ? React.createElement(
              'div',
              { ...stripNonDOMProps(props), 'data-open': open },
              children,
            )
          : React.createElement('div', {
              ...stripNonDOMProps(props),
              'data-open': false,
            }),
      {
        Portal: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Overlay: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Content: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Title: ({ children, ...props }) =>
          React.createElement('h2', stripNonDOMProps(props), children),
        Description: ({ children, ...props }) =>
          React.createElement('p', stripNonDOMProps(props), children),
        Close: ({ children, asChild, ...props }) =>
          asChild && React.isValidElement(children)
            ? children
            : React.createElement('button', stripNonDOMProps(props), children),
        Trigger: ({ children, asChild, ...props }) =>
          asChild && React.isValidElement(children)
            ? children
            : React.createElement('button', stripNonDOMProps(props), children),
      },
    ),
    Popover: Object.assign(
      ({ children, open: _o, onOpenChange: _oc, ...props }) =>
        React.createElement('div', stripNonDOMProps(props), children),
      {
        Trigger: ({ children, ...props }) =>
          React.createElement('button', stripNonDOMProps(props), children),
        Content: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Arrow: (props) => React.createElement('div', stripNonDOMProps(props)),
        Close: ({ children, ...props }) =>
          React.createElement('button', stripNonDOMProps(props), children),
        Sheet: Object.assign(
          ({
            children,
            modal: _m,
            open: _o,
            onOpenChange: _oc,
            snapPoints: _sp,
            dismissOnSnapToBottom: _d,
            ...props
          }) => React.createElement('div', stripNonDOMProps(props), children),
          {
            Frame: ({ children, ...props }) =>
              React.createElement('div', stripNonDOMProps(props), children),
            ScrollView: ({ children, ...props }) =>
              React.createElement('div', stripNonDOMProps(props), children),
            Overlay: ({ children, ...props }) =>
              React.createElement('div', stripNonDOMProps(props), children),
          },
        ),
      },
    ),
    Label: ({ children, ...props }) =>
      React.createElement('label', stripNonDOMProps(props), children),
    View: ({ children, ...props }) =>
      React.createElement('div', stripNonDOMProps(props), children),
    Tabs: Object.assign(
      ({ children, ...props }) =>
        React.createElement('div', stripNonDOMProps(props), children),
      {
        Tab: ({ children, ...props }) =>
          React.createElement('button', stripNonDOMProps(props), children),
        List: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Content: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
      },
    ),
    Theme: ({ children }) => React.createElement('div', {}, children),
    Adapt: Object.assign(
      ({ children, ...props }) =>
        React.createElement('div', stripNonDOMProps(props), children),
      {
        Contents: (props) =>
          React.createElement('div', stripNonDOMProps(props)),
      },
    ),
    VisuallyHidden: ({ children, ...props }) =>
      React.createElement('div', stripNonDOMProps(props), children),
    Tooltip: Object.assign(
      ({ children, ...props }) =>
        React.createElement('div', stripNonDOMProps(props), children),
      {
        Trigger: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Content: ({ children, ...props }) =>
          React.createElement('div', stripNonDOMProps(props), children),
        Arrow: (props) => React.createElement('div', stripNonDOMProps(props)),
      },
    ),
    styled: (Component) => Component,
    // Every breakpoint false by default (desktop-equivalent); tests that need
    // a narrower viewport override with `(useMedia as jest.Mock).mockReturnValue(...)`.
    useMedia: jest.fn(() => ({})),
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
      ({ children }) =>
        React.createElement('div', {}, children),
  };
});

// Mock individual Tamagui icon packages (merged to include all needed icons)
jest.mock('@tamagui/lucide-icons', () => {
  const React = require('react');

  // Icon components receive Tamagui style props that must not reach DOM
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
    'width',
    'height',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
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
  ]);
  function stripIconProps(props = {}) {
    const clean = {};
    for (const key of Object.keys(props)) {
      if (!ICON_NON_DOM.has(key) && !key.startsWith('$'))
        clean[key] = props[key];
    }
    return clean;
  }

  const createIcon =
    (name) =>
    ({ children, ...props }) =>
      React.createElement(
        'div',
        { ...stripIconProps(props), 'data-testid': name },
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
    ChevronLeft: createIcon('ChevronLeft'),
    ChevronRight: createIcon('ChevronRight'),
    Filter: createIcon('Filter'),
    X: createIcon('X'),
    Check: createIcon('Check'),
    Plus: createIcon('Plus'),
    Minus: createIcon('Minus'),
    ArrowLeft: createIcon('ArrowLeft'),
    ArrowRight: createIcon('ArrowRight'),
    ArrowLeftRight: createIcon('ArrowLeftRight'),
    EllipsisVertical: createIcon('EllipsisVertical'),
    Calendar: createIcon('Calendar'),
    Settings: createIcon('Settings'),
    Sort: createIcon('Sort'),
    BookOpen: createIcon('BookOpen'),
    Star: createIcon('Star'),
    Trophy: createIcon('Trophy'),
    Award: createIcon('Award'),
    Lock: createIcon('Lock'),
    Info: createIcon('Info'),
    AlertCircle: createIcon('AlertCircle'),
    ShieldCheck: createIcon('ShieldCheck'),
    CheckCircle2: createIcon('CheckCircle2'),
    Circle: createIcon('Circle'),
    Hourglass: createIcon('Hourglass'),
    // Icons used by PendingTradeOffers and TradingCenter
    AlertTriangle: createIcon('AlertTriangle'),
    Clock: createIcon('Clock'),
    DollarSign: createIcon('DollarSign'),
    Send: createIcon('Send'),
    Badge: createIcon('Badge'),
    History: createIcon('History'),
    MessageSquare: createIcon('MessageSquare'),
    Shield: createIcon('Shield'),
    Users: createIcon('Users'),
    Zap: createIcon('Zap'),
    // Icons used by DraftBottomNav (LS-9397)
    ClipboardList: createIcon('ClipboardList'),
    LayoutGrid: createIcon('LayoutGrid'),
    List: createIcon('List'),
    MessageCircle: createIcon('MessageCircle'),
    // Icons used by MatchupScoreboardView
    Swords: createIcon('Swords'),
    Activity: createIcon('Activity'),
    TrendingUp: createIcon('TrendingUp'),
    // Icons used by MatchupCard status badge
    CheckCircle: createIcon('CheckCircle'),
    XCircle: createIcon('XCircle'),
    // Icons used by PremiumTradeTools
    TrendingDown: createIcon('TrendingDown'),
    BarChart2: createIcon('BarChart2'),
    Calculator: createIcon('Calculator'),
    // Icon used by SeasonAwardsControl's remove-award button
    Trash2: createIcon('Trash2'),
  };
});

// @tanstack/react-virtual ships a nested node_modules/react that collides with
// the project's React dispatcher, causing "Invalid hook call" in jsdom tests.
// Mock the virtualizer to render all items flat — virtualizer behaviour is not
// under test here; only the component data-flow is.
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

jest.mock('@tamagui/sheet', () => {
  const React = require('react');
  return {
    Sheet: {
      Frame: ({ children }) => React.createElement('div', {}, children),
      ScrollView: ({ children }) => React.createElement('div', {}, children),
    },
  };
});

// Console suppression for tests - suppress only noise that cannot be fixed here.
// Prop-leakage warnings (non-boolean attribute, unknown prop, unknown event handler)
// were previously suppressed but are now fixed at the source in the mocks above.
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.error = (...args) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      // Suppress nesting warnings from simplified mock DOM structure
      (args[0].includes('validateDOMNesting') ||
        // Suppress act() warnings — most originate from Apollo MockedProvider
        // async state updates or component effects that fire after test
        // assertions complete. These are false positives in the test context.
        args[0].includes('not wrapped in act'))
    ) {
      return;
    }
    originalError(...args);
  };

  console.warn = (...args) => {
    // Suppress Apollo-specific warnings that are not actionable
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillReceiveProps') ||
        args[0].includes('addTypename') ||
        args[0].includes('go.apollo.dev'))
    ) {
      return;
    }
    originalWarn(...args);
  };
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
