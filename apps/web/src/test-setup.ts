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
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';

// Mock global __DEV__ variable for React Native
(global as any).__DEV__ = true;

// Mock React Native components that might not be available in web environment
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native-web');

  return {
    ...RN,
    Platform: {
      OS: 'web',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      select: (options: any) => options.web || options.default,
    },
    StyleSheet: {
      ...RN.StyleSheet,
      hairlineWidth: 1,
    },
    Dimensions: {
      get: () => ({ width: 1024, height: 768 }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    PixelRatio: {
      get: () => 1,
      getPixelSizeForLayoutSize: (size: any) => size,
    },
  };
});

// Mock React Native SVG
jest.mock('react-native-svg', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
