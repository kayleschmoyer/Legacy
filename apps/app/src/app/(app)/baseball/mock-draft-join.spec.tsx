import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import JoinMockDraftScreen from './mock-draft-join';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

const mockJoinMockDraft = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useJoinMockDraftMutation: () => [mockJoinMockDraft, { loading: false }],
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JoinMockDraftScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJoinMockDraft.mockResolvedValue({
      data: { joinMockDraft: { leagueId: 42, id: 55, name: 'My Team' } },
    });
  });

  it('renders the form', () => {
    render(<JoinMockDraftScreen />);
    expect(screen.getByText('🎟️ Join Mock Draft')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter 8-character code')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your team name')).toBeTruthy();
  });

  it('joins and navigates to the draft board on success', async () => {
    render(<JoinMockDraftScreen />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Enter 8-character code'),
      'abc12xyz',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Enter your team name'),
      'My Team',
    );
    fireEvent.press(screen.getByText('Join Draft'));

    await waitFor(() => {
      expect(mockJoinMockDraft).toHaveBeenCalledWith({
        variables: { inviteCode: 'ABC12XYZ', teamName: 'My Team' },
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/DraftBoardPage',
      params: { leagueId: '42' },
    });
  });

  it('surfaces a rejected mutation as an inline error', async () => {
    mockJoinMockDraft.mockRejectedValue(new Error('This mock draft is full.'));
    render(<JoinMockDraftScreen />);

    fireEvent.changeText(
      screen.getByPlaceholderText('Enter 8-character code'),
      'abc12xyz',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Enter your team name'),
      'My Team',
    );
    fireEvent.press(screen.getByText('Join Draft'));

    await waitFor(() => {
      expect(screen.getByText('This mock draft is full.')).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('calls router.back on cancel', () => {
    render(<JoinMockDraftScreen />);
    fireEvent.press(screen.getByText('Cancel'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
