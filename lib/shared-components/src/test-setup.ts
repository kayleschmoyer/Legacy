import '@testing-library/jest-dom';

// Mock react-native components and utilities
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  SafeAreaView: 'SafeAreaView', // Add SafeAreaView mock
  TextInput: 'TextInput',
  StyleSheet: {
    create: (styles: any) => styles,
    flatten: (style: any) => style,
  },
  Platform: {
    OS: 'ios',
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
