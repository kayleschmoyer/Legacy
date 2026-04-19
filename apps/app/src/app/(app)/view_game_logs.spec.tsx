import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
// ── Component under test ─────────────────────────────────────────────────────
import ViewGameLogs from './view_game_logs';

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
    Row: ({ data }: { data: (string | number | undefined)[] }) => (
      <View testID="row">
        {data?.map((cell, i) => (
          <Text key={i}>{cell !== undefined ? String(cell) : ''}</Text>
        ))}
      </View>
    ),
  };
});

jest.mock('../../common/utilities/ErrorHandler', () => ({
  handleError: jest.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ViewGameLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial rendering', () => {
    it('renders without crashing', () => {
      render(<ViewGameLogs />);
      expect(screen.getByText('Retrieve stats for a player')).toBeTruthy();
    });

    it('renders two text inputs (player and date)', () => {
      render(<ViewGameLogs />);
      expect(screen.getAllByDisplayValue('')).toHaveLength(2);
    });

    it('renders the Get Player Data button', () => {
      render(<ViewGameLogs />);
      expect(screen.getByText('Get Player Data')).toBeTruthy();
    });

    it('does not show table before data is loaded', () => {
      render(<ViewGameLogs />);
      expect(screen.queryByTestId('table')).toBeNull();
    });
  });

  describe('input interaction', () => {
    it('updates player ID input', () => {
      render(<ViewGameLogs />);
      const [playerInput] = screen.getAllByDisplayValue('');
      fireEvent.changeText(playerInput, '99');
      expect(screen.getByDisplayValue('99')).toBeTruthy();
    });

    it('updates date input', () => {
      render(<ViewGameLogs />);
      const [, dateInput] = screen.getAllByDisplayValue('');
      fireEvent.changeText(dateInput, '2025-04-01');
      expect(screen.getByDisplayValue('2025-04-01')).toBeTruthy();
    });
  });

  describe('fetch game logs', () => {
    it('calls axios.post with player id and game date when button is pressed', async () => {
      mockAxiosPost.mockResolvedValueOnce({ data: {} });

      render(<ViewGameLogs />);
      const [playerInput, dateInput] = screen.getAllByDisplayValue('');
      fireEvent.changeText(playerInput, '99');
      fireEvent.changeText(dateInput, '2025-04-01');
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(mockAxiosPost).toHaveBeenCalledWith(expect.any(String), {
          game_date: '2025-04-01',
          player_id: '99',
        });
      });
    });

    it('renders game stats table when data is returned', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          AB: { '1': 4, '2': 3 },
          H: { '1': 2, '2': 1 },
          HR: { '1': 1, '2': 0 },
        },
      });

      render(<ViewGameLogs />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeTruthy();
      });
      // Header row shows stat names
      expect(screen.getByText('AB')).toBeTruthy();
      expect(screen.getByText('H')).toBeTruthy();
      expect(screen.getByText('HR')).toBeTruthy();
    });

    it('renders one data row per game', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          AB: { '1': 4, '2': 3 },
          H: { '1': 2, '2': 1 },
        },
      });

      render(<ViewGameLogs />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeTruthy();
      });
      // 1 header row + 2 data rows = 3 rows total
      expect(screen.getAllByTestId('row')).toHaveLength(3);
    });

    it('renders only the header row when API returns empty data', async () => {
      mockAxiosPost.mockResolvedValueOnce({ data: {} });

      render(<ViewGameLogs />);
      fireEvent.press(screen.getByText('Get Player Data'));

      await waitFor(() => {
        expect(screen.getByTestId('table')).toBeTruthy();
      });
      // Expect only the header row and no data rows for an empty response
      expect(screen.getAllByTestId('row')).toHaveLength(1);
    });
  });
});
