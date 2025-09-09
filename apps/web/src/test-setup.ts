/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
      select: (options) => options.web || options.default,
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
      getPixelSizeForLayoutSize: (size) => size,
    },
  };
});

// Mock React Native SVG
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: ({ children, ...props }) => React.createElement('svg', props, children),
    Circle: (props) => React.createElement('circle', props),
    Rect: (props) => React.createElement('rect', props),
    Path: (props) => React.createElement('path', props),
    G: ({ children, ...props }) => React.createElement('g', props, children),
    Text: ({ children, ...props }) => React.createElement('text', props, children),
    Line: (props) => React.createElement('line', props),
    Polygon: (props) => React.createElement('polygon', props),
    Polyline: (props) => React.createElement('polyline', props),
    Ellipse: (props) => React.createElement('ellipse', props),
    Image: (props) => React.createElement('image', props),
    ClipPath: ({ children, ...props }) => React.createElement('clipPath', props, children),
    Defs: ({ children, ...props }) => React.createElement('defs', props, children),
    LinearGradient: ({ children, ...props }) => React.createElement('linearGradient', props, children),
    RadialGradient: ({ children, ...props }) => React.createElement('radialGradient', props, children),
    Stop: (props) => React.createElement('stop', props),
    Use: (props) => React.createElement('use', props),
    Symbol: ({ children, ...props }) => React.createElement('symbol', props, children),
    Marker: ({ children, ...props }) => React.createElement('marker', props, children),
    Pattern: ({ children, ...props }) => React.createElement('pattern', props, children),
    Mask: ({ children, ...props }) => React.createElement('mask', props, children),
    ForeignObject: ({ children, ...props }) => React.createElement('foreignObject', props, children),
    TSpan: ({ children, ...props }) => React.createElement('tspan', props, children),
    TextPath: ({ children, ...props }) => React.createElement('textPath', props, children),
  };
});

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

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
