/* eslint-disab  return {
    ...RN,
    Platform: {
      OS: 'web',
      select: (options: any) => options.web || options.default,
    },
    StyleSheet: {
      ...RN.StyleSheet,
      hairlineWidth: 1,
    },
    Dimensions: {
      get: (size?: any) => ({ width: 1024, height: 768 }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- test setup mocks use any throughout */
/* eslint-disable @typescript-eslint/no-unsafe-return -- test setup mocks use any throughout */
/* eslint-disable @typescript-eslint/no-unsafe-call -- test setup mocks use any throughout */
/* eslint-disable @typescript-eslint/no-var-requires -- test setup mocks use any throughout */
/* eslint-disable @typescript-eslint/no-explicit-any -- test setup mocks use any throughout */
import '@testing-library/jest-dom';

// Set global test timeout to 30 seconds to prevent interruptions on slower CI runners
jest.setTimeout(30000);

// Suppress expected Tamagui React DOM prop warnings in test output
const originalError = console.error;
const tamaguiPropWarnings = [
  'borderColor',
  'borderWidth',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'gap',
  'rowGap',
  'columnGap',
  'cursor',
  'marginBottom',
  'marginTop',
  'marginLeft',
  'marginRight',
  'paddingBottom',
  'paddingTop',
  'paddingLeft',
  'paddingRight',
  'userSelect',
  'pointerEvents',
];

beforeAll(() => {
  console.error = (...args: any[]) => {
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      // Skip Tamagui-related React DOM warnings.
      // React passes prop name as args[1] with a printf-style %s placeholder in
      // args[0], so check both the message format and the prop name argument.
      if (firstArg.includes('React does not recognize')) {
        const propName = typeof args[1] === 'string' ? args[1] : '';
        if (
          tamaguiPropWarnings.includes(propName) ||
          tamaguiPropWarnings.some((prop) => firstArg.includes(`\`${prop}\``))
        ) {
          return;
        }
      }
      // Skip "If you want to write it to the DOM, pass a string instead" warnings
      // for boolean Tamagui props (e.g. active, disabled, checked) — only suppress
      // when the prop name starts with '$' or is a known Tamagui prop.
      if (firstArg.includes('pass a string instead')) {
        const propName = typeof args[1] === 'string' ? args[1] : '';
        if (
          propName.startsWith('$') ||
          tamaguiPropWarnings.includes(propName)
        ) {
          return;
        }
      }
      // Skip Tamagui $ media query prop warnings (e.g. $gtMd, $sm)
      if (
        firstArg.includes('React does not recognize') &&
        typeof args[1] === 'string' &&
        args[1].startsWith('$')
      ) {
        return;
      }
      // Skip "Invalid attribute name: `$gtMd`" warnings from Tamagui media props
      if (
        firstArg.includes('Invalid attribute name') &&
        typeof args[1] === 'string' &&
        args[1].startsWith('$')
      ) {
        return;
      }
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Mock global __DEV__ variable for React Native
(global as any).__DEV__ = true;

// Mock environment configuration module for tests
jest.mock('./config/environment', () => ({
  env: {
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-google-client-id',
    graphqlUrl: 'http://localhost:5000/graphql',
    isDev: true,
  },
  getEnvironmentConfig: jest.fn(() => ({
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-google-client-id',
    graphqlUrl: 'http://localhost:5000/graphql',
    isDev: true,
  })),
}));

// Mock auth service from shared-components
let mockAuthService: any = null;

jest.mock('@legacy-sports/shared-components', () => {
  const React = require('react');
  const actualModule = jest.requireActual('@legacy-sports/shared-components');

  // Mock auth service
  const mockService = {
    getState: jest.fn(() => ({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
    })),
    subscribe: jest.fn(),
    login: jest.fn().mockResolvedValue({ success: true }),
    logout: jest.fn().mockResolvedValue({ success: true }),
    refreshToken: jest.fn().mockResolvedValue({ success: true }),
    checkAuthStatus: jest.fn().mockResolvedValue({ success: true }),
  };

  return {
    ...actualModule,
    createAuthService: jest.fn((config) => {
      mockAuthService = mockService;
      return mockService;
    }),
    getAuthService: jest.fn(() => mockAuthService),
    resetAuthService: jest.fn(() => {
      mockAuthService = null;
    }),
    useAuth: jest.fn(() => ({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
      login: jest.fn().mockResolvedValue({ success: true }),
      logout: jest.fn().mockResolvedValue({ success: true }),
      refreshToken: jest.fn().mockResolvedValue({ success: true }),
      checkAuthStatus: jest.fn().mockResolvedValue({ success: true }),
    })),
  };
});

// Mock platform-components to resolve build-time magic string replacement
jest.mock('__PLATFORM_COMPONENTS__', () => {
  const React = require('react');

  // Mock component that handles platform-specific functionality
  const createMockComponent = (displayName: string) => {
    const Component = ({ children, ...props }: any) =>
      React.createElement('div', props, children);
    Component.displayName = displayName;
    return Component;
  };

  return {
    // Platform providers with OAuth methods
    OAuthProvider: Object.assign(
      ({ children }: any) => React.createElement('div', {}, children),
      {
        configure: jest.fn().mockResolvedValue({ success: true }),
      },
    ),
    OAuthErrorCode: {
      CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
      SIGNIN_ERROR: 'SIGNIN_ERROR',
      NETWORK_ERROR: 'NETWORK_ERROR',
    },
    SecureStorageProvider: ({ children }: any) =>
      React.createElement('div', {}, children),
    PlatformProviders: ({ children }: any) =>
      React.createElement('div', {}, children),

    // Platform utilities
    PlatformUtils: {
      signInWithGoogle: jest
        .fn()
        .mockResolvedValue({ success: true, user: { id: '1', name: 'Test' } }),
      signOut: jest.fn().mockResolvedValue({ success: true }),
      getSecureValue: jest.fn().mockResolvedValue('mock-value'),
      setSecureValue: jest.fn().mockResolvedValue(true),
      removeSecureValue: jest.fn().mockResolvedValue(true),
    },

    // Platform components - create React Native equivalents for web
    Platform: {
      OS: 'web',
      Version: '1.0',
      select: (obj: any) => obj.web || obj.default,
    },

    Dimensions: {
      get: () => ({ width: 1024, height: 768 }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },

    // Mock all the standard React Native components
    View: createMockComponent('View'),
    Text: createMockComponent('Text'),
    ScrollView: createMockComponent('ScrollView'),
    TouchableOpacity: createMockComponent('TouchableOpacity'),
    TouchableHighlight: createMockComponent('TouchableHighlight'),
    TextInput: createMockComponent('TextInput'),
    Image: createMockComponent('Image'),
    Button: createMockComponent('Button'),
    Switch: createMockComponent('Switch'),
    ActivityIndicator: createMockComponent('ActivityIndicator'),
    Modal: createMockComponent('Modal'),
    Pressable: createMockComponent('Pressable'),

    // Default export for compatibility
    default: {
      OAuthProvider: Object.assign(
        ({ children }: any) => React.createElement('div', {}, children),
        {
          configure: jest.fn().mockResolvedValue({ success: true }),
        },
      ),
      OAuthErrorCode: {
        CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
        SIGNIN_ERROR: 'SIGNIN_ERROR',
        NETWORK_ERROR: 'NETWORK_ERROR',
      },
      SecureStorageProvider: ({ children }: any) =>
        React.createElement('div', {}, children),
      PlatformProviders: ({ children }: any) =>
        React.createElement('div', {}, children),
      PlatformUtils: {
        signInWithGoogle: jest.fn().mockResolvedValue({
          success: true,
          user: { id: '1', name: 'Test' },
        }),
        signOut: jest.fn().mockResolvedValue({ success: true }),
        getSecureValue: jest.fn().mockResolvedValue('mock-value'),
        setSecureValue: jest.fn().mockResolvedValue(true),
        removeSecureValue: jest.fn().mockResolvedValue(true),
      },
      Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
      Dimensions: { get: () => ({ width: 1024, height: 768 }) },
    },
  };
});

// React Native is now mocked via moduleNameMapper pointing to __mocks__/react-native.js
// This avoids Jest resolver issues with react-native-web

// Mock React Native SVG
jest.mock('react-native-svg', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory needs runtime require
  const React = require('react');
  return {
    Svg: ({ children, ...props }: any) =>
      React.createElement('svg', props, children),
    Circle: (props: any) => React.createElement('circle', props),
    Rect: (props: any) => React.createElement('rect', props),
    Path: (props: any) => React.createElement('path', props),
    G: ({ children, ...props }: any) =>
      React.createElement('g', props, children),
    Text: ({ children, ...props }: any) =>
      React.createElement('text', props, children),
    Line: (props: any) => React.createElement('line', props),
    Polygon: (props: any) => React.createElement('polygon', props),
    Polyline: (props: any) => React.createElement('polyline', props),
    Ellipse: (props: any) => React.createElement('ellipse', props),
    Image: (props: any) => React.createElement('image', props),
    ClipPath: ({ children, ...props }: any) =>
      React.createElement('clipPath', props, children),
    Defs: ({ children, ...props }: any) =>
      React.createElement('defs', props, children),
    LinearGradient: ({ children, ...props }: any) =>
      React.createElement('linearGradient', props, children),
    RadialGradient: ({ children, ...props }: any) =>
      React.createElement('radialGradient', props, children),
    Stop: (props: any) => React.createElement('stop', props),
    Use: (props: any) => React.createElement('use', props),
    Symbol: ({ children, ...props }: any) =>
      React.createElement('symbol', props, children),
    Marker: ({ children, ...props }: any) =>
      React.createElement('marker', props, children),
    Pattern: ({ children, ...props }: any) =>
      React.createElement('pattern', props, children),
    Mask: ({ children, ...props }: any) =>
      React.createElement('mask', props, children),
    ForeignObject: ({ children, ...props }: any) =>
      React.createElement('foreignObject', props, children),
    TSpan: ({ children, ...props }: any) =>
      React.createElement('tspan', props, children),
    TextPath: ({ children, ...props }: any) =>
      React.createElement('textPath', props, children),
  };
});

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
  takeRecords: jest.fn(),
})) as any;

// Mock window.matchMedia for responsive components
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
