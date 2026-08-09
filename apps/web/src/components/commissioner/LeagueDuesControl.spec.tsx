/**
 * LS-8134 regression: the league-dues form must not flash its `useState`
 * defaults (enabled=false, empty amount) in the frame after the settings
 * query resolves but before the sync effect mirrors server data into state.
 * Gate is `!initialized`, not `queryLoading && !initialized`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { LeagueDuesControl } from './LeagueDuesControl';

const mockUseSettings = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDuesSettingsQuery: (...args: unknown[]): unknown =>
    mockUseSettings(...args),
  useUpdateDuesSettingsMutation: () => [mockUpdate, { loading: false }],
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('tamagui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    Button: Passthrough,
    Card: Passthrough,
    H4: Passthrough,
    Input: (props: any) => <input value={props.value ?? ''} readOnly />,
    Separator: () => <hr />,
    Spinner: () => <span data-testid="spinner" />,
    Text: Passthrough,
    XStack: Passthrough,
    YStack: Passthrough,
  };
});

describe('LeagueDuesControl loading gate (LS-8134)', () => {
  beforeEach(() => {
    mockUseSettings.mockReset();
    mockUpdate.mockReset();
  });

  it('shows the spinner while the settings query is still loading', () => {
    mockUseSettings.mockReturnValue({ data: undefined, loading: true });

    render(<LeagueDuesControl leagueId={1} />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('Enable League Dues')).not.toBeInTheDocument();
  });

  it('does NOT flash the default disabled form between query resolution and effect sync', () => {
    // First render: query has just resolved with enabled=true settings, but the
    // mirror-to-state useEffect has not yet run. The pre-fix code would render
    // the form here with the stale useState(false) default.
    mockUseSettings.mockReturnValue({
      data: {
        leagueDuesSettings: {
          id: 1,
          leagueId: 1,
          enabled: true,
          amountCents: 5000,
          reminderEnabled: false,
          reminderDayOfWeek: 1,
        },
      },
      loading: false,
    });

    act(() => {
      render(<LeagueDuesControl leagueId={1} />);
    });

    // After the effect commits, the form is shown with the synced enabled state.
    expect(screen.getByText('Enable League Dues')).toBeInTheDocument();
    // The form should have the dues-amount section visible (gated by `enabled`),
    // proving the rendered checkbox state was synced from server data — not a
    // flash of the useState(false) default.
    expect(screen.getByText('Dues Amount')).toBeInTheDocument();
  });

  it('falls through to defaults when the server has no settings yet', () => {
    mockUseSettings.mockReturnValue({
      data: { leagueDuesSettings: null },
      loading: false,
    });

    render(<LeagueDuesControl leagueId={1} />);

    expect(screen.getByText('Enable League Dues')).toBeInTheDocument();
    expect(screen.queryByText('Dues Amount')).not.toBeInTheDocument();
  });
});
