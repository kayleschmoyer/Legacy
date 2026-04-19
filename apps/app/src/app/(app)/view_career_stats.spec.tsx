import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
// ── Component under test ─────────────────────────────────────────────────────
import ViewCareerStats from './view_career_stats';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAxiosPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    // Lazy closure: mockAxiosPost is read at call time, not at factory-init time
    post: (...args: unknown[]): unknown => mockAxiosPost(...args),
    create: () => ({
      post: (...args: unknown[]): unknown => mockAxiosPost(...args),
    }),
  },
}));

// Mock RN Button to avoid TouchableOpacity animation/renderer version issues.
// Using Proxy avoids eagerly evaluating lazy native-module getters on the RN module.
jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return new Proxy(RN, {
    get(target, prop: string) {
      if (prop === 'Button') {
        return ({ title, onPress }: { title?: string; onPress?: () => void }) =>
          React.createElement(target.Text, { onPress }, title);
      }
      return Reflect.get(target, prop) as unknown;
    },
  });
});

jest.mock('react-native-table-component', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Table: ({ children }: { children: React.ReactNode }) => (
      <View testID="table">{children}</View>
    ),
    Row: ({ data }: { data: (string | number)[] }) => (
      <View testID="row">
        {data?.map((cell, i) => (
          <Text key={i}>{String(cell)}</Text>
        ))}
      </View>
    ),
  };
});

jest.mock('../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ViewCareerStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial rendering', () => {
    it('renders without crashing', () => {
      render(<ViewCareerStats />);
      expect(
        screen.getByText('Retrieve career stats for a player'),
      ).toBeTruthy();
    });

    it('renders the player ID input', () => {
      render(<ViewCareerStats />);
      // TextInput has no placeholder, find by value (empty string)
      expect(screen.getByDisplayValue('')).toBeTruthy();
    });

    it('renders the Get Player Data button', () => {
      render(<ViewCareerStats />);
      expect(screen.getByText('Get Player Data')).toBeTruthy();
    });

    it('does not show any tables before data is loaded', () => {
      render(<ViewCareerStats />);
      expect(screen.queryByTestId('table')).toBeNull();
    });
  });

  describe('input interaction', () => {
    it('updates player ID when text is entered', () => {
      render(<ViewCareerStats />);
      const input = screen.getByDisplayValue('');
      fireEvent.changeText(input, '12345');
      expect(screen.getByDisplayValue('12345')).toBeTruthy();
    });
  });

  describe('fetch career stats', () => {
    it('calls axios.post with the player id when button is pressed', async () => {
      mockAxiosPost.mockResolvedValueOnce({ data: {} });

      render(<ViewCareerStats />);
      fireEvent.changeText(screen.getByDisplayValue(''), '12345');
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(mockAxiosPost).toHaveBeenCalledWith(expect.any(String), {
          player_id: '12345',
        });
      });
    });

    it('renders batting table when batting data is returned', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          batting: { AVG: 0.301, HR: 40, RBI: 95 },
        },
      });

      render(<ViewCareerStats />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getAllByTestId('table').length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.getByText('AVG')).toBeTruthy();
      expect(screen.getByText('HR')).toBeTruthy();
      expect(screen.getByText('RBI')).toBeTruthy();
    });

    it('renders pitching table when pitching data is returned', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          pitching: { ERA: 2.85, W: 15, K: 210 },
        },
      });

      render(<ViewCareerStats />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getByText('ERA')).toBeTruthy();
      });
      expect(screen.getByText('W')).toBeTruthy();
      expect(screen.getByText('K')).toBeTruthy();
    });

    it('renders fielding table when fielding data is returned', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          fielding: { FP: 0.992, E: 3, A: 210 },
        },
      });

      render(<ViewCareerStats />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getByText('FP')).toBeTruthy();
      });
      expect(screen.getByText('E')).toBeTruthy();
      expect(screen.getByText('A')).toBeTruthy();
    });

    it('renders all three tables when all stat groups are returned', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          batting: { AVG: 0.301 },
          pitching: { ERA: 2.85 },
          fielding: { FP: 0.992 },
        },
      });

      render(<ViewCareerStats />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getAllByTestId('table')).toHaveLength(3);
      });
    });
  });
});
