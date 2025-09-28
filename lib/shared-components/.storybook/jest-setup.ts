import '@testing-library/jest-dom';

// Setup for Storybook tests
global.beforeEach(() => {
  // Clear any mocks or reset state between tests
  jest.clearAllMocks();
});

// Mock React Native components for web environment
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: any) => obj.web || obj.default,
  },
  View: 'div',
  Text: 'span',
  ScrollView: 'div',
  StyleSheet: {
    create: (styles: any) => styles,
    absoluteFill: {},
  },
}));

// Mock UI Kitten for tests
jest.mock('@ui-kitten/components', () => ({
  Spinner: () => 'Spinner Component',
  ApplicationProvider: ({ children }: any) => children,
}));

// Suppress specific warnings during tests
const originalConsoleWarn = console.warn;
beforeEach(() => {
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('deprecated') || args[0].includes('CJS build of Vite'))
    ) {
      return;
    }
    originalConsoleWarn(...args);
  };
});

afterEach(() => {
  console.warn = originalConsoleWarn;
});
