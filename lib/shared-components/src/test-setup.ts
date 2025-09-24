import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
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

// Mock react-native components and utilities
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  SafeAreaView: 'SafeAreaView', // Add SafeAreaView mock
  TextInput: 'TextInput',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: Record<string, unknown>) => style,
  },
  Platform: {
    OS: 'ios',
    select: jest.fn(
      (platforms: { ios?: unknown; default?: unknown }) =>
        platforms.ios || platforms.default,
    ),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 667 })), // Default to mobile size
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

// Mock react-native-table-component
jest.mock('react-native-table-component', () => ({
  Table: 'Table',
  Row: 'Row',
  Cell: 'Cell',
}));

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
