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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    create: (styles: any) => styles,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    flatten: (style: any) => style,
  },
  Platform: {
    OS: 'ios',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    select: jest.fn((platforms) => platforms.ios || platforms.default),
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
global.fetch = jest.fn();
