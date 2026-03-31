import { PendingWaiverClaims } from './PendingWaiverClaims';
import { fireEvent, render, waitFor } from '../../test-utils';
import type { WaiverClaim } from '../../api/db/graphql.generated';

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

jest.mock('../../api/db/graphql.generated', () => ({
  useGetTeamWaiverClaimsQuery: jest.fn(() => mockQueryReturn),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendingWaiverClaims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
