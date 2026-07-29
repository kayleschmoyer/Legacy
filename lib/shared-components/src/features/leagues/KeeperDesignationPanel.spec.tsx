import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KeeperDesignationPanel } from './KeeperDesignationPanel';

const mockDesignateKeeper = jest.fn();
const mockUndesignateKeeper = jest.fn();

/**
 * A real Apollo `useQuery` re-renders its caller when the cache updates,
 * independent of any parent-driven render — a plain jest.fn() returning a
 * fixed value can't reproduce that, so this fakes just enough of the
 * subscription behavior to catch regressions that only show up under real
 * Apollo reactivity (see the LS-8674 fix below).
 */
let listeners: Array<() => void> = [];
let currentData: unknown;
function setRosterData(next: unknown) {
  currentData = next;
  listeners.forEach((l) => l());
}
function useFakeReactiveRosterQuery() {
  const [, forceRender] = React.useReducer((c: number) => c + 1, 0);
  React.useEffect(() => {
    listeners.push(forceRender);
    return () => {
      listeners = listeners.filter((l) => l !== forceRender);
    };
  }, []);
  return { data: currentData, loading: false };
}
// jest.mock's factory can't reference out-of-scope identifiers unless
// "mock"-prefixed, but eslint's rules-of-hooks requires the hook itself be
// named with a "use" prefix — indirect through a mock-prefixed holder so
// both constraints are satisfied.
const mockHooks = { useFakeReactiveRosterQuery };

jest.mock('@legacy-sports/graphql', () => ({
  useGetKeeperEligibleRosterQuery: () => mockHooks.useFakeReactiveRosterQuery(),
  useDesignateKeeperMutation: () => [mockDesignateKeeper, {}],
  useUndesignateKeeperMutation: () => [mockUndesignateKeeper, {}],
}));

const KEEPER_SETTINGS = {
  keeperCount: 2,
  costModel: 'round-penalty',
  maxConsecutiveKeeps: null,
  rookieExempt: false,
};

function eligiblePlayer(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 101,
    teamId: 1,
    isRookie: false,
    designated: false,
    designationId: null,
    previewCostRound: 5,
    previewCostAmount: null,
    player: { id: 101, firstName: 'Mike', lastName: 'Trout' },
    ...overrides,
  };
}

describe('KeeperDesignationPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing for a non-keeper league', () => {
    setRosterData({ keeperEligibleRoster: [] });
    const { container } = render(
      <KeeperDesignationPanel
        leagueId={1}
        keeperSettings={null}
        draftStatus="not-started"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('flips to Undesignate immediately after designating — LS-8674', async () => {
    setRosterData({ keeperEligibleRoster: [eligiblePlayer()] });
    mockDesignateKeeper.mockResolvedValue({ data: {} });

    render(
      <KeeperDesignationPanel
        leagueId={1}
        keeperSettings={KEEPER_SETTINGS}
        draftStatus="not-started"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep', exact: true }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Undesignate' }),
      ).toBeInTheDocument();
    });
    expect(mockDesignateKeeper).toHaveBeenCalledWith({
      variables: { leagueId: 1, playerId: 101 },
    });
  });

  /**
   * LS-8674 regression: the button must revert as soon as the
   * undesignateKeeper mutation resolves — it must NOT depend on the
   * subsequent GetKeeperEligibleRoster refetch landing (that refetch is
   * fire-and-forget eventual-consistency, e.g. for keeperCount). Previously
   * `awaitRefetchQueries: true` made the mutation await that refetch before
   * resolving, and the button read `designated` straight from the (stale
   * until refetch) roster prop — if the refetch never completed in a given
   * environment, the button stayed stuck showing a spinner forever.
   */
  it('reverts to Keep immediately after undesignating, without waiting on a roster refetch', async () => {
    setRosterData({
      keeperEligibleRoster: [
        eligiblePlayer({ designated: true, designationId: 999 }),
      ],
    });
    // Mutation resolves, but the roster refetch it triggers never does —
    // simulates a hermetic-mock or slow-network environment.
    mockUndesignateKeeper.mockResolvedValue({ data: {} });

    render(
      <KeeperDesignationPanel
        leagueId={1}
        keeperSettings={KEEPER_SETTINGS}
        draftStatus="not-started"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Undesignate' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undesignate' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Keep', exact: true }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Keep', exact: true }),
    ).not.toBeDisabled();
  });

  it('disables the button and shows the locked message once the draft is live', () => {
    setRosterData({ keeperEligibleRoster: [eligiblePlayer()] });
    render(
      <KeeperDesignationPanel
        leagueId={1}
        keeperSettings={KEEPER_SETTINGS}
        draftStatus="in-progress"
      />,
    );
    expect(
      screen.getByText('Designations are locked — the draft has started.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep', exact: true }),
    ).toBeDisabled();
  });
});
