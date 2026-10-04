import React from 'react';
import { render } from '@testing-library/react-native';

import BaseballMockDraftJoinRedirect from './mock-draft-join';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockParams: { inviteCode?: string } = {};
const mockRedirect = jest.fn<null, [{ href: unknown }]>(() => null);
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: unknown }) => mockRedirect(props),
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BaseballMockDraftJoinRedirect (LS-10078)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.inviteCode;
  });

  it('sends a code-carrying link to the universal join route', () => {
    mockParams.inviteCode = 'MOCK2345';
    render(<BaseballMockDraftJoinRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({
      href: { pathname: '/join/[code]', params: { code: 'MOCK2345' } },
    });
  });

  it('sends the bare join screen to /join', () => {
    render(<BaseballMockDraftJoinRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/join' });
  });
});
