import React from 'react';
import { render } from '@testing-library/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  isModuleNotFoundError,
  NativeNavigator,
  NavigationRoute,
  NotFound,
  WebNavigator,
} from './TamaguiAppNavigator';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = LOGGER as jest.Mocked<typeof LOGGER>;

// Replace BrowserRouter with MemoryRouter so we can control the initial URL.
let mockInitialEntries: string[] = ['/'];

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <actual.MemoryRouter initialEntries={mockInitialEntries}>
        {children}
      </actual.MemoryRouter>
    ),
  };
});

// Mock React Navigation packages (not available in jsdom)
const mockCreateDrawerNavigator = jest.fn();

jest.mock('@react-navigation/drawer', () => ({
  createDrawerNavigator: (...args: unknown[]): unknown =>
    mockCreateDrawerNavigator(...args) as unknown,
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Screen: () => null,
  }),
}));

// ─── Test helpers ────────────────────────────────────────────────────

const DummyHome = () => <div>Home Page</div>;
const DummyAbout = () => <div>About Page</div>;

const testRoutes: NavigationRoute[] = [
  { name: 'Home', component: DummyHome, title: 'Home', path: '/home' },
  { name: 'About', component: DummyAbout, title: 'About', path: '/about' },
];

// ─── isModuleNotFoundError ───────────────────────────────────────────

describe('isModuleNotFoundError', () => {
  it('returns true for a Node.js MODULE_NOT_FOUND error', () => {
    const err = new Error('Cannot find module foo');
    (err as Error & { code: string }).code = 'MODULE_NOT_FOUND';
    expect(isModuleNotFoundError(err)).toBe(true);
  });

  it('returns true when the message contains "Cannot find module"', () => {
    expect(isModuleNotFoundError(new Error('Cannot find module bar'))).toBe(
      true,
    );
  });

  it('returns true when the message contains "Module not found"', () => {
    expect(
      isModuleNotFoundError(new Error('Module not found: ./missing')),
    ).toBe(true);
  });

  it('returns false for a generic Error', () => {
    expect(isModuleNotFoundError(new Error('null is not an object'))).toBe(
      false,
    );
  });

  it('returns false for a non-Error value', () => {
    expect(isModuleNotFoundError('some string')).toBe(false);
    expect(isModuleNotFoundError(42)).toBe(false);
    expect(isModuleNotFoundError(null)).toBe(false);
  });
});

// ─── NotFound component ──────────────────────────────────────────────

describe('NotFound', () => {
  it('renders a 404 message', () => {
    const { getByText } = render(<NotFound />);
    expect(getByText(/404/)).toBeTruthy();
    expect(getByText(/does not exist/)).toBeTruthy();
  });
});

// ─── WebNavigator ────────────────────────────────────────────────────

describe('WebNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialEntries = ['/'];
  });

  it('renders the matched route component', () => {
    mockInitialEntries = ['/home'];
    const { getByText } = render(<WebNavigator routes={testRoutes} />);
    expect(getByText('Home Page')).toBeTruthy();
  });

  it('renders the default (first) route at "/"', () => {
    mockInitialEntries = ['/'];
    const { getByText } = render(<WebNavigator routes={testRoutes} />);
    expect(getByText('Home Page')).toBeTruthy();
  });

  it('renders NotFound for an unmatched URL', () => {
    mockInitialEntries = ['/this-does-not-exist'];
    const { getByText } = render(<WebNavigator routes={testRoutes} />);
    expect(getByText(/404/)).toBeTruthy();
  });

  it('renders navigation links for all routes', () => {
    mockInitialEntries = ['/home'];
    const { getByText } = render(<WebNavigator routes={testRoutes} />);
    expect(getByText('Home')).toBeTruthy();
    expect(getByText('About')).toBeTruthy();
  });
});

// ─── NativeNavigator catch narrowing ─────────────────────────────────

describe('NativeNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back gracefully when createDrawerNavigator throws MODULE_NOT_FOUND', () => {
    const moduleError = new Error(
      'Cannot find module @react-navigation/drawer',
    );
    (moduleError as Error & { code: string }).code = 'MODULE_NOT_FOUND';
    mockCreateDrawerNavigator.mockImplementation(() => {
      throw moduleError;
    });

    const { getByText } = render(<NativeNavigator routes={testRoutes} />);

    expect(getByText('Home Page')).toBeTruthy();
    const warnCalls = mockLogger.warn.mock.calls as [string, ...unknown[]][];
    const navWarn = warnCalls.find(
      ([msg]) => msg === 'React Navigation not available:',
    );
    expect(navWarn).toBeDefined();
  });

  it('re-throws non-module errors from createDrawerNavigator', () => {
    const runtimeError = new Error('Cannot read properties of null');
    mockCreateDrawerNavigator.mockImplementation(() => {
      throw runtimeError;
    });

    expect(() => render(<NativeNavigator routes={testRoutes} />)).toThrow(
      runtimeError,
    );

    const errorCalls = mockLogger.error.mock.calls as [string, unknown][];
    const navError = errorCalls.find(
      ([msg]) => msg === 'Navigation initialization failed',
    );
    expect(navError).toBeDefined();
    expect(navError?.[1]).toHaveProperty('name');
    expect(navError?.[1]).toHaveProperty('message');
    expect(navError?.[1]).toHaveProperty('stack');
  });

  it('uses fallbackComponent when module is not found and fallback is provided', () => {
    const moduleError = new Error(
      'Cannot find module @react-navigation/drawer',
    );
    (moduleError as Error & { code: string }).code = 'MODULE_NOT_FOUND';
    mockCreateDrawerNavigator.mockImplementation(() => {
      throw moduleError;
    });

    const Fallback = () => <div>Custom Fallback</div>;
    const { getByText } = render(
      <NativeNavigator routes={testRoutes} fallbackComponent={Fallback} />,
    );

    expect(getByText('Custom Fallback')).toBeTruthy();
  });
});
