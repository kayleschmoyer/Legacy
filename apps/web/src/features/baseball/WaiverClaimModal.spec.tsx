/**
 * Tests for WaiverClaimModal (LS-4043).
 *
 * Covers the error-dismissal fix: when a waiver claim fails and the user
 * closes the modal before reading the error, handleClose() must dispatch an
 * `apollo:error` CustomEvent so ApolloErrorToast surfaces it on the page.
 */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useGetTeamMembersQuery } from '@legacy-sports/graphql';
import { WaiverClaimModal } from './WaiverClaimModal';

/* ── Mock state (read by factory implementations at render time) ─────────── */

let capturedOnOpenChange: ((isOpen: boolean) => void) | undefined;
let mockClaimFn: jest.Mock = jest.fn();

/* ── Prop types for typed mock factories ─────────────────────────────────── */

interface WithChildren {
  children?: React.ReactNode;
}
interface DialogProps extends WithChildren {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
interface ButtonProps extends WithChildren {
  onPress?: () => void;
  disabled?: boolean;
}
interface InputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
}

/* ── Module mocks ──────────────────────────────────────────────────────────── */

jest.mock('tamagui', () => {
  const Dialog = Object.assign(
    ({ children, open, onOpenChange }: DialogProps) => {
      capturedOnOpenChange = onOpenChange;
      return open ? <div role="dialog">{children}</div> : null;
    },
    {
      Portal: ({ children }: WithChildren) => <div>{children}</div>,
      Overlay: () => null,
      Content: ({ children }: WithChildren) => <div>{children}</div>,
      Close: ({ children }: WithChildren) => <div>{children}</div>,
    },
  );

  return {
    createTokens: (tokens: unknown) => tokens,
    Dialog,
    Button: ({ children, onPress, disabled }: ButtonProps) => (
      <button onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
    Input: ({ value, onChangeText, placeholder }: InputProps) => (
      <input
        value={value ?? ''}
        onChange={(e) => {
          onChangeText?.(e.target.value);
        }}
        placeholder={placeholder}
      />
    ),
    Text: ({ children }: WithChildren) => <span>{children}</span>,
    XStack: ({ children }: WithChildren) => <div>{children}</div>,
    YStack: ({ children }: WithChildren) => <div>{children}</div>,
    ScrollView: ({ children }: WithChildren) => <div>{children}</div>,
    Separator: () => <hr />,
    Spinner: () => <span>loading</span>,
    styled: <T,>(c: T): T => c,
    Tooltip: Object.assign(
      ({ children }: WithChildren) => <div>{children}</div>,
      {
        Trigger: ({ children }: WithChildren) => <div>{children}</div>,
        Content: ({ children }: WithChildren) => <div>{children}</div>,
        Arrow: () => null,
      },
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertCircle: () => null,
  ArrowRightLeft: () => null,
  Check: () => null,
  DollarSign: () => null,
  UserMinus: () => null,
  UserPlus: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useClaimFreeAgentMutation: jest.fn(() => [mockClaimFn, { loading: false }]),
  useGetUserTeamIdQuery: jest.fn(() => ({
    data: { userTeamId: 99 },
    loading: false,
  })),
  useGetTeamMembersQuery: jest.fn(() => ({
    data: { teamMembers: [] },
    loading: false,
  })),
}));

jest.mock('../../store/hooks', () => ({
  useAppSelector: jest.fn((selector: (s: unknown) => unknown) =>
    selector({
      league: {
        leagueData: {
          maxRosterSize: 25,
          waiverType: 'standard',
          faabBudgetDefault: 100,
        },
      },
    }),
  ),
}));

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  withAlpha: (color: string): string => color,
}));

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

const player = {
  id: 42,
  firstName: 'Walter',
  lastName: 'Johnson',
  eligiblePositions: ['SP'],
};
const leagueId = 1;

/* ── Tests ─────────────────────────────────────────────────────────────────── */

describe('WaiverClaimModal – error dismissal (LS-4043)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaimFn = jest.fn().mockResolvedValue({});
    capturedOnOpenChange = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dispatches apollo:error with player name and error when closed while a claim error is pending', async () => {
    mockClaimFn = jest.fn().mockRejectedValue(new Error('Server error'));

    const onClose = jest.fn();
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /submit claim/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    act(() => {
      capturedOnOpenChange?.(false);
    });

    const errorEvent = dispatchSpy.mock.calls
      .map((c) => c[0])
      .find((e) => e.type === 'apollo:error') as
      | CustomEvent<{ message: string }>
      | undefined;

    expect(errorEvent).toBeDefined();
    expect(errorEvent?.detail.message).toContain('Walter Johnson');
    expect(errorEvent?.detail.message).toContain('Server error');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not dispatch apollo:error when closed with no pending claim error', () => {
    const onClose = jest.fn();
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={onClose}
      />,
    );

    act(() => {
      capturedOnOpenChange?.(false);
    });

    const hasErrorEvent = dispatchSpy.mock.calls.some(
      (c) => c[0].type === 'apollo:error',
    );
    expect(hasErrorEvent).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('includes a fallback label when the player has no name', async () => {
    mockClaimFn = jest.fn().mockRejectedValue(new Error('Forbidden'));
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    render(
      <WaiverClaimModal
        open
        player={{ id: 7, firstName: null, lastName: null }}
        leagueId={leagueId}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /submit claim/i }));

    await waitFor(() => {
      expect(screen.getByText('Forbidden')).toBeInTheDocument();
    });

    act(() => {
      capturedOnOpenChange?.(false);
    });

    const errorEvent = dispatchSpy.mock.calls
      .map((c) => c[0])
      .find((e) => e.type === 'apollo:error') as
      | CustomEvent<{ message: string }>
      | undefined;

    expect(errorEvent).toBeDefined();
    expect(errorEvent?.detail.message).toContain('player');
  });
});

describe('WaiverClaimModal – roster capacity source (LS-9769)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaimFn = jest.fn().mockResolvedValue({});
    capturedOnOpenChange = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Reproduces the reported contradiction: the roster-service mock (which
   * stands in for `claimFreeAgent`'s server-side `checkRosterCapacity` check)
   * counts a real roster at capacity, while the Redux `league.leagueData`
   * slice mock — the never-populated fallback the v2 free-agents route
   * leaves in place — still says the cap is 25. Before the fix, the modal
   * read `maxRosterSize` from that stale Redux slice only, so it rendered
   * "Roster has space" and let the user submit without picking a player to
   * drop, exactly the state the reported claim was rejected against.
   */
  it('gates on the league-fragment maxRosterSize prop, not the stale Redux fallback, when the roster is actually full', () => {
    (useGetTeamMembersQuery as jest.Mock).mockReturnValue({
      data: {
        teamMembers: [
          { id: 1, player: { id: 501, firstName: 'A', lastName: 'One' } },
        ],
      },
      loading: false,
    });

    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={jest.fn()}
        maxRosterSize={1}
      />,
    );

    expect(
      screen.getByText(/Roster full \(1\/1\) — select a player to drop/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Roster has space/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /submit claim/i }),
    ).toBeDisabled();
  });

  it('falls back to the Redux league.leagueData cap when no maxRosterSize prop is supplied', () => {
    (useGetTeamMembersQuery as jest.Mock).mockReturnValue({
      data: {
        teamMembers: [
          { id: 1, player: { id: 501, firstName: 'A', lastName: 'One' } },
        ],
      },
      loading: false,
    });
    // Explicitly re-set (rather than relying on the previous test's mock) so
    // this test's expectations hold regardless of execution order.

    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={jest.fn()}
      />,
    );

    // The mocked Redux slice reports maxRosterSize: 25, so a 1-player roster
    // still has space under the legacy fallback path.
    expect(screen.getByText(/Roster has space \(1\/25\)/i)).toBeInTheDocument();
  });
});

describe('WaiverClaimModal – waiver type source (LS-10009)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaimFn = jest.fn().mockResolvedValue({});
    capturedOnOpenChange = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Mirrors LS-9769: the Redux `league.leagueData` slice mock (never
   * populated by the v2 free-agents route) reports 'standard', but the
   * league-fragment prop says this league is actually FAAB. Before the fix,
   * the modal read `waiverType` from Redux only, so it would hide the
   * required FAAB bid input and let the user submit a claim the server-side
   * mutation rejects for a missing bid.
   */
  it('renders the FAAB bid input when the league-fragment waiverType prop is faab, even though Redux says standard', () => {
    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={jest.fn()}
        waiverType="faab"
        faabBudgetDefault={250}
      />,
    );

    expect(screen.getByText('FAAB Bid Amount')).toBeInTheDocument();
    expect(
      screen.getByText(/League budget: \$250 per team/i),
    ).toBeInTheDocument();
  });

  it('hides the FAAB bid input when the league-fragment waiverType prop is standard', () => {
    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={jest.fn()}
        waiverType="standard"
        faabBudgetDefault={250}
      />,
    );

    expect(screen.queryByText('FAAB Bid Amount')).not.toBeInTheDocument();
  });

  it('falls back to the Redux league.leagueData waiverType when no waiverType prop is supplied', () => {
    // The mocked Redux slice reports waiverType: 'standard', so the FAAB
    // input should stay hidden under the legacy fallback path.
    render(
      <WaiverClaimModal
        open
        player={player}
        leagueId={leagueId}
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText('FAAB Bid Amount')).not.toBeInTheDocument();
  });
});
