import type { TeamWaiverPriority, WaiverClaim } from '@legacy-sports/graphql';
import { PendingWaiverClaims } from './PendingWaiverClaims';
import { fireEvent, render, waitFor } from '../../test-utils';

// ---------------------------------------------------------------------------
// Mock the GraphQL hooks
// ---------------------------------------------------------------------------

const mockRefetch = jest.fn().mockResolvedValue({});
const mockCancelClaim = jest.fn().mockResolvedValue({});

let mockQueryReturn: {
  data: { teamWaiverClaims: WaiverClaim[] } | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: jest.Mock;
};

let mockPriorityQueryReturn: {
  data: { teamWaiverPriority: TeamWaiverPriority | null } | undefined;
};

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamWaiverClaimsQuery: jest.fn(() => mockQueryReturn),
  useGetTeamWaiverPriorityQuery: jest.fn(() => mockPriorityQueryReturn),
  useCancelWaiverClaimMutation: () => [mockCancelClaim],
}));

const TEAM_ID = 1;

function makeClaim(
  overrides: Partial<WaiverClaim> & { id: number },
): WaiverClaim {
  return {
    __typename: 'WaiverClaim',
    leagueId: 10,
    teamId: TEAM_ID,
    playerId: 100,
    dropPlayerId: null,
    faabBid: null,
    status: 'pending',
    errorMessage: null,
    playerName: 'Mike Trout',
    dropPlayerName: null,
    processedAt: null,
    createdAt: '2026-03-18T14:30:00Z',
    userId: null,
    ...overrides,
  };
}

const basicClaim = makeClaim({
  id: 1,
  playerId: 100,
  playerName: 'Mike Trout',
});

const claimWithDrop = makeClaim({
  id: 2,
  playerId: 200,
  playerName: 'Mookie Betts',
  dropPlayerId: 300,
  dropPlayerName: 'Aaron Judge',
});

const claimWithFaab = makeClaim({
  id: 3,
  playerId: 400,
  playerName: 'Shohei Ohtani',
  faabBid: 25,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setClaims(claims: WaiverClaim[]) {
  mockQueryReturn = {
    data: { teamWaiverClaims: claims },
    loading: false,
    error: undefined,
    refetch: mockRefetch,
  };
}

function setPriority(priority: TeamWaiverPriority | null) {
  mockPriorityQueryReturn = { data: { teamWaiverPriority: priority } };
}

function makePriority(
  overrides: Partial<TeamWaiverPriority> = {},
): TeamWaiverPriority {
  return {
    __typename: 'TeamWaiverPriority',
    teamId: TEAM_ID,
    waiverType: 'standard',
    priority: 3,
    totalTeams: 12,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendingWaiverClaims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPriority(null);
  });

  // ---- Hiding when empty ----

  it('renders nothing when there are no claims', () => {
    setClaims([]);
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the card with loading state when data has not arrived yet', () => {
    mockQueryReturn = {
      data: undefined,
      loading: true,
      error: undefined,
      refetch: mockRefetch,
    };
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    // The component returns null when loading (no data, no error)
    // but the actual component shows the card when loading is true
    // Re-checking component logic: `if (!loading && !error && claims.length === 0) return null;`
    // When loading=true, the condition is false, so it renders the card
    expect(container.innerHTML).not.toBe('');
  });

  // ---- Rendering claims ----

  it('shows the "Pending Waiver Claims" header', () => {
    setClaims([basicClaim]);
    const { getByText } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByText('Pending Waiver Claims')).toBeTruthy();
  });

  it('renders the player name for a claim', () => {
    setClaims([basicClaim]);
    const { getByText } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByText('Mike Trout')).toBeTruthy();
  });

  it('renders a fallback when playerName is null', () => {
    setClaims([makeClaim({ id: 10, playerId: 999, playerName: null })]);
    const { getByText } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByText('Player #999')).toBeTruthy();
  });

  it('shows drop player info when dropPlayerId is present', () => {
    setClaims([claimWithDrop]);
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(container.textContent).toContain('Drop:');
    expect(container.textContent).toContain('Aaron Judge');
  });

  it('shows FAAB bid when faabBid is present and > 0', () => {
    setClaims([claimWithFaab]);
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(container.textContent).toContain('$25 FAAB');
  });

  it('shows the pending count in the footer', () => {
    setClaims([basicClaim, claimWithDrop]);
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(container.textContent).toContain('2 pending claims');
  });

  it('uses singular "claim" for a single pending claim', () => {
    setClaims([basicClaim]);
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(container.textContent).toContain('1 pending claim');
    expect(container.textContent).not.toContain('1 pending claims');
  });

  it('renders multiple claims', () => {
    setClaims([basicClaim, claimWithDrop, claimWithFaab]);
    const { getByText } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByText('Mike Trout')).toBeTruthy();
    expect(getByText('Mookie Betts')).toBeTruthy();
    expect(getByText('Shohei Ohtani')).toBeTruthy();
  });

  // ---- Waiver priority badge (LS-6312 / FLD-029) ----

  it('shows the priority badge for a standard (non-FAAB) league', () => {
    setClaims([basicClaim]);
    setPriority(makePriority({ priority: 3, totalTeams: 12 }));
    const { getByTestId } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByTestId('waiver-priority-badge').textContent).toBe(
      'Priority: 3rd of 12',
    );
  });

  it('formats 1st/2nd/3rd/4th/11th ordinals correctly', () => {
    setClaims([basicClaim]);
    setPriority(makePriority({ priority: 1, totalTeams: 10 }));
    const { rerender, getByTestId } = render(
      <PendingWaiverClaims teamId={TEAM_ID} />,
    );
    expect(getByTestId('waiver-priority-badge').textContent).toBe(
      'Priority: 1st of 10',
    );

    setPriority(makePriority({ priority: 2, totalTeams: 10 }));
    rerender(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByTestId('waiver-priority-badge').textContent).toBe(
      'Priority: 2nd of 10',
    );

    setPriority(makePriority({ priority: 11, totalTeams: 12 }));
    rerender(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(getByTestId('waiver-priority-badge').textContent).toBe(
      'Priority: 11th of 12',
    );
  });

  it('hides the priority badge for a FAAB league', () => {
    setClaims([basicClaim]);
    setPriority(makePriority({ waiverType: 'faab', priority: null }));
    const { queryByTestId } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(queryByTestId('waiver-priority-badge')).toBeNull();
  });

  it('hides the priority badge when priority data has not loaded', () => {
    setClaims([basicClaim]);
    setPriority(null);
    const { queryByTestId } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(queryByTestId('waiver-priority-badge')).toBeNull();
  });

  // ---- Cancel mutation + refetch ----

  it('calls cancelClaim mutation and refetches when Cancel is pressed', async () => {
    setClaims([basicClaim]);
    const { getByText } = render(<PendingWaiverClaims teamId={TEAM_ID} />);

    fireEvent.click(getByText('Cancel'));
    expect(mockCancelClaim).toHaveBeenCalledWith({
      variables: { claimId: 1 },
    });

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it('shows "Cancelling" text while the mutation is in flight', async () => {
    // Make cancelClaim return a promise that we control
    // noop default - replaced when the promise is constructed
    let resolveMutation: () => void = () => undefined;
    mockCancelClaim.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveMutation = resolve;
      }),
    );

    setClaims([basicClaim]);
    const { getByText } = render(<PendingWaiverClaims teamId={TEAM_ID} />);

    fireEvent.click(getByText('Cancel'));

    await waitFor(() => expect(getByText('Cancelling')).toBeTruthy());

    // Resolve the mutation so the component settles
    resolveMutation();
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  // ---- Error display ----

  it('shows error banner when query returns an error', () => {
    mockQueryReturn = {
      data: undefined,
      loading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    };
    const { container } = render(<PendingWaiverClaims teamId={TEAM_ID} />);
    expect(container.textContent).toContain('Failed to load waiver claims');
  });

  // ---- onSubscribeRefresh bridge (LS-8862) ----

  it('registers its refetch with onSubscribeRefresh on mount', () => {
    setClaims([basicClaim]);
    const onSubscribeRefresh = jest.fn(() => undefined);
    render(
      <PendingWaiverClaims
        teamId={TEAM_ID}
        onSubscribeRefresh={onSubscribeRefresh}
      />,
    );

    expect(onSubscribeRefresh).toHaveBeenCalledTimes(1);
    const [registeredRefetch] = onSubscribeRefresh.mock.calls[0] as [
      () => void,
    ];
    registeredRefetch();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('invokes the onSubscribeRefresh cleanup on unmount', () => {
    setClaims([basicClaim]);
    const cleanup = jest.fn();
    const onSubscribeRefresh = jest.fn(() => cleanup);
    const { unmount } = render(
      <PendingWaiverClaims
        teamId={TEAM_ID}
        onSubscribeRefresh={onSubscribeRefresh}
      />,
    );

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('works without onSubscribeRefresh (optional prop)', () => {
    setClaims([basicClaim]);
    expect(() =>
      render(<PendingWaiverClaims teamId={TEAM_ID} />),
    ).not.toThrow();
  });
});
