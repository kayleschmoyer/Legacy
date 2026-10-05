import React from 'react';
import { render } from '@testing-library/react-native';

import MockDraftsHubScreen from './mock-drafts';

let capturedProps: Record<string, unknown> | null = null;
let mockTabParam: string | undefined;
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ tab: mockTabParam }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));

jest.mock('@legacy-sports/shared-components/draft', () => ({
  MockDraftsHub: (props: Record<string, unknown>) => {
    capturedProps = props;
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <View testID="mock-drafts-hub" />;
  },
}));

type HubProps = {
  initialTab: string;
  refreshKey: number;
  onOpenDraft: (t: { draftId: number; sport: string }) => void;
  onInviteAccepted: (
    t:
      | { kind: 'mock'; draftId: number; sport: string }
      | { kind: 'league'; leagueId: number; sport: string },
  ) => void;
  onCreateMockDraft: (sport: string) => void;
};

function props(): HubProps {
  return capturedProps as unknown as HubProps;
}

describe('MockDraftsHubScreen', () => {
  beforeEach(() => {
    capturedProps = null;
    mockTabParam = undefined;
    mockPush.mockClear();
  });

  it('renders the shared hub on the Join tab and refreshes on focus', () => {
    const { getByTestId } = render(<MockDraftsHubScreen />);

    expect(getByTestId('mock-drafts-hub')).toBeTruthy();
    expect(props().initialTab).toBe('join');
    expect(props().refreshKey).toBe(1);
  });

  it('opens the tab named in the route', () => {
    mockTabParam = 'invites';
    render(<MockDraftsHubScreen />);
    expect(props().initialTab).toBe('invites');

    mockTabParam = 'bogus';
    render(<MockDraftsHubScreen />);
    expect(props().initialTab).toBe('join');
  });

  it('routes drafts, accepted invites and setup', () => {
    render(<MockDraftsHubScreen />);

    props().onOpenDraft({ draftId: 41, sport: 'baseball' });
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/mock-draft/[draftId]',
      params: { draftId: '41' },
    });

    props().onInviteAccepted({
      kind: 'league',
      leagueId: 9,
      sport: 'football',
    });
    expect(mockPush).toHaveBeenLastCalledWith('/football/league/9');

    props().onCreateMockDraft('baseball');
    expect(mockPush).toHaveBeenLastCalledWith('/baseball/mock-draft');
  });
});
