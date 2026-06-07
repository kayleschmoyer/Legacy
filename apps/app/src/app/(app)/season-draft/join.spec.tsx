import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SeasonDraftJoinScreen from './join';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: Record<string, string | string[]> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockSearchParams,
}));

const mockUserInfo = {
  id: 7,
  username: 'CommishCarl',
  email: 'carl@example.com',
  isAdmin: false,
  about: null,
};
jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => mockUserInfo,
}));

jest.mock('../_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

// Mock tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Capture the props passed to the shared SeasonDraftJoin so we can verify
// wiring without rendering its full Apollo-backed implementation.
const mockSeasonDraftJoinProps = jest.fn();
jest.mock('@legacy-sports/shared-components', () => ({
  SeasonDraftJoin: (props: {
    inviteCode: string;
    viewerName?: string;
    onJoined: (gameId: number) => void;
    onCancel: () => void;
    onBrowseGames?: () => void;
  }) => {
    mockSeasonDraftJoinProps(props);
    const { Text, Button } = jest.requireActual<
      typeof import('../../../__test-utils__/tamagui-mocks')
    >('../../../__test-utils__/tamagui-mocks').tamaguiMocks;
    return (
      <>
        <Text>code:{props.inviteCode}</Text>
        <Text>viewer:{props.viewerName}</Text>
        <Button onPress={() => props.onJoined(42)}>join</Button>
        <Button onPress={() => props.onCancel()}>cancel</Button>
        <Button onPress={() => props.onBrowseGames?.()}>browse</Button>
      </>
    );
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SeasonDraftJoinScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { inviteCode: 'ABC123' };
  });

  it('renders the shared SeasonDraftJoin with the invite code and viewer name', () => {
    render(<SeasonDraftJoinScreen />);
    expect(screen.getByText('code:ABC123')).toBeTruthy();
    expect(screen.getByText('viewer:CommishCarl')).toBeTruthy();
  });

  it('uses the first value when inviteCode arrives as an array', () => {
    mockSearchParams = { inviteCode: ['XYZ789', 'extra'] };
    render(<SeasonDraftJoinScreen />);
    expect(screen.getByText('code:XYZ789')).toBeTruthy();
  });

  it('shows an error when no invite code is present', () => {
    mockSearchParams = {};
    render(<SeasonDraftJoinScreen />);
    expect(screen.getByText('Invalid invite link.')).toBeTruthy();
    expect(mockSeasonDraftJoinProps).not.toHaveBeenCalled();
  });

  it('navigates to the live game screen on successful join', () => {
    render(<SeasonDraftJoinScreen />);
    fireEvent.press(screen.getByText('join'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/season-draft/[gameId]',
      params: { gameId: '42' },
    });
  });

  it('navigates back on cancel', () => {
    render(<SeasonDraftJoinScreen />);
    fireEvent.press(screen.getByText('cancel'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('navigates to the lobby on browse games', () => {
    render(<SeasonDraftJoinScreen />);
    fireEvent.press(screen.getByText('browse'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/season-draft' });
  });
});
